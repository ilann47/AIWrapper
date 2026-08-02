import json
import os
import time
import uuid
from typing import AsyncIterator, List

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .codex import CodexError, run_codex, run_codex_last_message
from .config import settings
from .deps import rate_limiter, verify_api_key
from .model_registry import (
    choose_model,
    get_available_models,
    initialize_model_registry,
)
from .security import assert_local_only_or_raise
from .prompt import build_prompt_and_images, normalize_responses_input
from .images import save_image_to_temp
from .schemas import (
    ChatChoice,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatMessageResponse,
    Usage,
    ResponsesRequest,
    ResponsesObject,
    ResponsesMessage,
    ResponsesOutputText,
    ResponsesUsage,
)
from .aiwrapper.governance import evaluate_user_quota, record_usage
from .aiwrapper.nine_router import compress_request
from .aiwrapper.opencodex import (
    ExecutionUsage,
    complete_with_opencodex,
    is_opencodex_backend,
    list_opencodex_models,
    opencodex_health,
    stream_with_opencodex,
)
from .aiwrapper.router import public_router as aiwrapper_public_router, router as aiwrapper_router
from .aiwrapper.auth import router as aiwrapper_auth_router
from .aiwrapper.store import store as aiwrapper_store

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.aiwrapper_cors_origin_list,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-AIWrapper-Session"],
    allow_credentials=True,
    expose_headers=["X-AIWrapper-RTK-Saved-Bytes"],
)

if settings.aiwrapper_enabled:
    app.include_router(aiwrapper_auth_router, dependencies=[Depends(rate_limiter)])
    app.include_router(aiwrapper_public_router, dependencies=[Depends(rate_limiter)])
    app.include_router(
        aiwrapper_router,
        dependencies=[Depends(verify_api_key), Depends(rate_limiter)],
    )


@app.on_event("startup")
async def startup_event() -> None:
    await initialize_model_registry()


def _stored_content(value: str) -> object:
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return value
    return parsed if isinstance(parsed, (list, dict)) else value


def _ledger_usage(usage: ExecutionUsage, prompt: str, output: str) -> dict[str, int]:
    if usage.input_tokens > 0 or usage.output_tokens > 0:
        return {
            "inputTokens": usage.input_tokens,
            "outputTokens": usage.output_tokens,
            "cachedInputTokens": usage.cached_input_tokens,
            "reasoningTokens": usage.reasoning_tokens,
        }
    return {
        "inputTokens": max(1, len(prompt) // 4),
        "outputTokens": max(0, len(output) // 4),
        "cachedInputTokens": 0,
        "reasoningTokens": 0,
    }


@app.get("/health/live", include_in_schema=False)
async def health_live():
    return {"status": "ok", "service": "aiwrapper-codex-wrapper"}


@app.get("/health/ready", include_in_schema=False)
async def health_ready():
    dependencies: dict[str, object] = {"database": "ok" if aiwrapper_store.health() else "failed"}
    status_code = 200
    if is_opencodex_backend():
        try:
            dependencies["opencodex"] = await opencodex_health()
        except CodexError as error:
            dependencies["opencodex"] = {"status": "failed", "message": str(error)}
            status_code = 503
    return JSONResponse({"status": "ok" if status_code == 200 else "not_ready", "dependencies": dependencies}, status_code=status_code)


@app.get("/v1/models", dependencies=[Depends(verify_api_key), Depends(rate_limiter)])
async def list_models():
    """Return available model list."""
    if is_opencodex_backend():
        try:
            return {"data": await list_opencodex_models()}
        except CodexError as error:
            raise HTTPException(status_code=error.status_code or 503, detail=str(error)) from error
    return {"data": [{"id": model} for model in get_available_models(include_reasoning_aliases=True)]}


@app.post("/v1/chat/completions", dependencies=[Depends(verify_api_key), Depends(rate_limiter)])
async def chat_completions(req: ChatCompletionRequest, request: Request):
    aiwrapper_user = getattr(request.state, "aiwrapper_principal", None)
    session = None
    request_id = uuid.uuid4().hex
    started_at = time.perf_counter()
    if aiwrapper_user:
        allowed, quota = await evaluate_user_quota(aiwrapper_user)
        if not allowed:
            await record_usage(userId=aiwrapper_user["id"], requestId=request_id, outcome="blocked", statusCode=429, model=req.model)
            raise HTTPException(status_code=429, detail={"message": "Individual quota exceeded", "type": "quota_exceeded", "windows": quota})
    if is_opencodex_backend():
        model_name, alias_effort = req.model or settings.aiwrapper_opencodex_default_model, None
    else:
        try:
            model_name, alias_effort = choose_model(req.model)
        except ValueError as e:
            raise HTTPException(
                status_code=404,
                detail={
                    "message": str(e),
                    "type": "invalid_request_error",
                    "code": "model_not_found",
                },
            )

    message_payload = [m.dict() for m in req.messages]
    if aiwrapper_user:
        raw_content = req.messages[-1].content if req.messages else ""
        if not isinstance(raw_content, str):
            raw_content = json.dumps(raw_content, ensure_ascii=False)
        requested_session = req.metadata.get("session_id") if req.metadata else None
        session = aiwrapper_store.session(aiwrapper_user["id"], requested_session if isinstance(requested_session, str) else None, model_name, raw_content)
        history = aiwrapper_store.session_messages(session["id"])
        message_payload = [{"role": row["role"], "content": _stored_content(row["content"])} for row in history]
    compressed_payload, rtk_stats = await compress_request({"messages": message_payload}, model_name)
    message_payload = compressed_payload.get("messages", message_payload)
    prompt, image_urls = build_prompt_and_images(message_payload)
    x_overrides = req.x_codex.dict(exclude_none=True) if req.x_codex else {}
    if req.reasoning_effort and "reasoning_effort" not in x_overrides:
        x_overrides["reasoning_effort"] = req.reasoning_effort
    if alias_effort and "reasoning_effort" not in x_overrides:
        x_overrides["reasoning_effort"] = alias_effort
    overrides = x_overrides or None

    # Safety gate: only allow danger-full-access when explicitly enabled
    if overrides and overrides.get("sandbox") == "danger-full-access":
        if not settings.allow_danger_full_access:
            raise HTTPException(status_code=400, detail="danger-full-access is disabled by server policy")

    # Enforce local-only model provider when enabled
    if settings.local_only:
        try:
            assert_local_only_or_raise()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    image_paths: List[str] = []
    if not is_opencodex_backend():
        try:
            for u in image_urls:
                image_paths.append(save_image_to_temp(u))
        except ValueError as e:
            for p in image_paths:
                try:
                    os.remove(p)
                except Exception:
                    pass
            raise HTTPException(status_code=400, detail=str(e))

    try:
        if req.stream:
            async def event_gen() -> AsyncIterator[bytes]:
                output_parts: list[str] = []
                outcome = "success"
                status_code = 200
                error_code = None
                backend_stream = stream_with_opencodex(
                    message_payload,
                    model_name,
                    (overrides or {}).get("reasoning_effort"),
                    temperature=req.temperature,
                    max_tokens=req.max_tokens,
                ) if is_opencodex_backend() else None
                try:
                    source = backend_stream if backend_stream is not None else run_codex(prompt, overrides, image_paths, model=model_name)
                    async for text in source:
                        if text:
                            output_parts.append(text)
                            chunk = {
                                "choices": [
                                    {"delta": {"content": text}, "index": 0, "finish_reason": None}
                                ]
                            }
                            yield f"data: {json.dumps(chunk)}\n\n".encode()
                    yield b"data: [DONE]\n\n"
                except Exception as error:
                    outcome = "failure"
                    status_code = getattr(error, "status_code", None) or 500
                    error_code = type(error).__name__
                    raise
                finally:
                    if aiwrapper_user:
                        final_text = "".join(output_parts)
                        if session and final_text:
                            aiwrapper_store.append_assistant(session["id"], final_text)
                        measured = _ledger_usage(backend_stream.usage if backend_stream else ExecutionUsage(), prompt, final_text)
                        await record_usage(
                            userId=aiwrapper_user["id"], requestId=request_id, outcome=outcome,
                            statusCode=status_code, errorCode=error_code, model=model_name,
                            durationMs=int((time.perf_counter() - started_at) * 1000),
                            **measured,
                        )

            rtk_saved = 0 if not rtk_stats else max(0, int(rtk_stats.get("bytesBefore", 0)) - int(rtk_stats.get("bytesAfter", 0)))
            return StreamingResponse(
                event_gen(),
                media_type="text/event-stream",
                headers={"X-AIWrapper-RTK-Saved-Bytes": str(rtk_saved)},
            )
        else:
            if is_opencodex_backend():
                completion = await complete_with_opencodex(
                    message_payload,
                    model_name,
                    (overrides or {}).get("reasoning_effort"),
                    temperature=req.temperature,
                    max_tokens=req.max_tokens,
                )
                final, measured_usage = completion.text, completion.usage
            else:
                final = await run_codex_last_message(prompt, overrides, image_paths, model=model_name)
                measured_usage = ExecutionUsage()
            if aiwrapper_user:
                if session:
                    aiwrapper_store.append_assistant(session["id"], final)
                measured = _ledger_usage(measured_usage, prompt, final)
                await record_usage(
                    userId=aiwrapper_user["id"], requestId=request_id, outcome="success", statusCode=200,
                    model=model_name, durationMs=int((time.perf_counter() - started_at) * 1000),
                    **measured,
                )
            resp = ChatCompletionResponse(
                choices=[ChatChoice(message=ChatMessageResponse(content=final))],
                usage=Usage(
                    prompt_tokens=measured_usage.input_tokens,
                    completion_tokens=measured_usage.output_tokens,
                    total_tokens=measured_usage.total_tokens,
                ),
            )
            return resp
    except CodexError as e:
        status = getattr(e, "status_code", None) or 500
        if aiwrapper_user and not req.stream:
            await record_usage(
                userId=aiwrapper_user["id"], requestId=request_id, outcome="failure", statusCode=status,
                errorCode=type(e).__name__, model=req.model,
                durationMs=int((time.perf_counter() - started_at) * 1000),
                inputTokens=max(1, len(prompt) // 4) if "prompt" in locals() else 0, outputTokens=0,
            )
        raise HTTPException(
            status_code=status,
            detail={
                "message": str(e),
                "type": "server_error" if status >= 500 else "upstream_error",
                "code": None,
            },
        )
    finally:
        for p in image_paths:
            try:
                os.remove(p)
            except Exception:
                pass


@app.post("/v1/responses", dependencies=[Depends(verify_api_key), Depends(rate_limiter)])
async def responses_endpoint(req: ResponsesRequest, request: Request):
    aiwrapper_user = getattr(request.state, "aiwrapper_principal", None)
    session = None
    ledger_request_id = uuid.uuid4().hex
    started_at = time.perf_counter()
    if aiwrapper_user:
        allowed, quota = await evaluate_user_quota(aiwrapper_user)
        if not allowed:
            await record_usage(userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome="blocked", statusCode=429, model=req.model)
            raise HTTPException(status_code=429, detail={"message": "Individual quota exceeded", "type": "quota_exceeded", "windows": quota})
    if is_opencodex_backend():
        model, alias_effort = req.model or settings.aiwrapper_opencodex_default_model, None
    else:
        try:
            model, alias_effort = choose_model(req.model)
        except ValueError as e:
            raise HTTPException(
                status_code=404,
                detail={
                    "message": str(e),
                    "type": "invalid_request_error",
                    "code": "model_not_found",
                },
            )

    # Normalize input → messages
    try:
        messages = normalize_responses_input(req.input)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    overrides = {}
    if alias_effort:
        overrides["reasoning_effort"] = alias_effort
    if req.reasoning and req.reasoning.effort:
        overrides["reasoning_effort"] = req.reasoning.effort

    # Enforce local-only model provider when enabled
    if settings.local_only:
        try:
            assert_local_only_or_raise()
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    if aiwrapper_user:
        raw_input = req.input if isinstance(req.input, str) else json.dumps(req.input, ensure_ascii=False)
        session = aiwrapper_store.session(aiwrapper_user["id"], req.previous_response_id, model, raw_input)
        history = aiwrapper_store.session_messages(session["id"])
        messages = [{"role": row["role"], "content": _stored_content(row["content"])} for row in history]
    compressed_payload, _ = await compress_request({"messages": messages}, model)
    messages = compressed_payload.get("messages", messages)
    prompt, image_urls = build_prompt_and_images(messages)

    resp_id = f"resp_{uuid.uuid4().hex}"
    msg_id = f"msg_{uuid.uuid4().hex}"
    created = int(time.time())
    response_model = req.model or model
    codex_overrides = overrides or None

    image_paths: List[str] = []
    if not is_opencodex_backend():
        try:
            for u in image_urls:
                image_paths.append(save_image_to_temp(u))
        except ValueError as e:
            for p in image_paths:
                try:
                    os.remove(p)
                except Exception:
                    pass
            raise HTTPException(status_code=400, detail=str(e))

    try:
        if req.stream:
            async def event_gen() -> AsyncIterator[bytes]:
                final_text = ""
                outcome = "success"
                status_code = 200
                error_code = None
                backend_stream = stream_with_opencodex(
                    messages,
                    model,
                    (codex_overrides or {}).get("reasoning_effort"),
                ) if is_opencodex_backend() else None
                try:
                    created_evt = {
                        "id": resp_id,
                        "object": "response",
                        "created": created,
                        "model": response_model,
                        "status": "in_progress",
                    }
                    yield f"event: response.created\ndata: {json.dumps(created_evt)}\n\n".encode()

                    buf: list[str] = []
                    source = backend_stream if backend_stream is not None else run_codex(prompt, codex_overrides, image_paths, model=model)
                    async for text in source:
                        if text:
                            buf.append(text)
                            delta_evt = {"id": resp_id, "delta": text}
                            yield f"event: response.output_text.delta\ndata: {json.dumps(delta_evt)}\n\n".encode()

                    final_text = "".join(buf)
                    done_evt = {"id": resp_id, "text": final_text}
                    yield f"event: response.output_text.done\ndata: {json.dumps(done_evt)}\n\n".encode()

                    final_obj = ResponsesObject(
                        id=resp_id,
                        created=created,
                        model=response_model,
                        status="completed",
                        output=[
                            ResponsesMessage(
                                id=msg_id,
                                content=[ResponsesOutputText(text=final_text)],
                            )
                        ],
                        usage=ResponsesUsage(
                            input_tokens=backend_stream.usage.input_tokens if backend_stream else 0,
                            output_tokens=backend_stream.usage.output_tokens if backend_stream else 0,
                            total_tokens=backend_stream.usage.total_tokens if backend_stream else 0,
                        ),
                    ).model_dump()
                    yield f"event: response.completed\ndata: {json.dumps(final_obj)}\n\n".encode()
                except CodexError as e:
                    outcome = "failure"
                    status_code = getattr(e, "status_code", None) or 500
                    error_code = type(e).__name__
                    err_evt = {"id": resp_id, "error": {"message": str(e)}}
                    yield f"event: response.error\ndata: {json.dumps(err_evt)}\n\n".encode()
                finally:
                    if aiwrapper_user:
                        if session and final_text:
                            aiwrapper_store.append_assistant(session["id"], final_text)
                        measured = _ledger_usage(backend_stream.usage if backend_stream else ExecutionUsage(), prompt, final_text)
                        await record_usage(
                            userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome=outcome,
                            statusCode=status_code, errorCode=error_code, model=model,
                            durationMs=int((time.perf_counter() - started_at) * 1000),
                            **measured,
                        )
                    yield b"data: [DONE]\n\n"

            headers = {
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
            return StreamingResponse(event_gen(), media_type="text/event-stream", headers=headers)
        else:
            if is_opencodex_backend():
                completion = await complete_with_opencodex(messages, model, (codex_overrides or {}).get("reasoning_effort"))
                final, measured_usage = completion.text, completion.usage
            else:
                final = await run_codex_last_message(prompt, codex_overrides, image_paths, model=model)
                measured_usage = ExecutionUsage()
            if aiwrapper_user:
                if session:
                    aiwrapper_store.append_assistant(session["id"], final)
                measured = _ledger_usage(measured_usage, prompt, final)
                await record_usage(
                    userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome="success", statusCode=200,
                    model=model, durationMs=int((time.perf_counter() - started_at) * 1000),
                    **measured,
                )
            resp = ResponsesObject(
                id=resp_id,
                created=created,
                model=response_model,
                status="completed",
                output=[
                    ResponsesMessage(
                        id=msg_id,
                        content=[ResponsesOutputText(text=final)],
                    )
                ],
                usage=ResponsesUsage(
                    input_tokens=measured_usage.input_tokens,
                    output_tokens=measured_usage.output_tokens,
                    total_tokens=measured_usage.total_tokens,
                ),
            )
            return resp
    except CodexError as e:
        status = getattr(e, "status_code", None) or 500
        if aiwrapper_user and not req.stream:
            await record_usage(
                userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome="failure", statusCode=status,
                errorCode=type(e).__name__, model=req.model,
                durationMs=int((time.perf_counter() - started_at) * 1000),
                inputTokens=max(1, len(prompt) // 4) if "prompt" in locals() else 0, outputTokens=0,
            )
        raise HTTPException(
            status_code=status,
            detail={
                "message": str(e),
                "type": "server_error" if status >= 500 else "upstream_error",
                "code": None,
            },
        )
    finally:
        for p in image_paths:
            try:
                os.remove(p)
            except Exception:
                pass
