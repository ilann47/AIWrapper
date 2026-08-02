import json
import os
import time
import uuid
from typing import AsyncIterator, List

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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
    ResponsesRequest,
    ResponsesObject,
    ResponsesMessage,
    ResponsesOutputText,
)
from .aiwrapper.governance import evaluate_user_quota, record_usage
from .aiwrapper.router import router as aiwrapper_router
from .aiwrapper.store import store as aiwrapper_store

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.aiwrapper_enabled:
    app.include_router(
        aiwrapper_router,
        dependencies=[Depends(rate_limiter), Depends(verify_api_key)],
    )


@app.on_event("startup")
async def startup_event() -> None:
    await initialize_model_registry()


@app.get("/v1/models", dependencies=[Depends(rate_limiter), Depends(verify_api_key)])
async def list_models():
    """Return available model list."""
    return {"data": [{"id": model} for model in get_available_models(include_reasoning_aliases=True)]}


@app.post("/v1/chat/completions", dependencies=[Depends(rate_limiter), Depends(verify_api_key)])
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
    prompt, image_urls = build_prompt_and_images(message_payload)
    if aiwrapper_user:
        raw_content = req.messages[-1].content if req.messages else ""
        if not isinstance(raw_content, str):
            raw_content = json.dumps(raw_content, ensure_ascii=False)
        requested_session = req.metadata.get("session_id") if req.metadata else None
        session = aiwrapper_store.session(aiwrapper_user["id"], requested_session if isinstance(requested_session, str) else None, model_name, raw_content)
        history = aiwrapper_store.session_messages(session["id"])
        prompt, _ = build_prompt_and_images([{"role": row["role"], "content": row["content"]} for row in history])
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
                try:
                    async for text in run_codex(prompt, overrides, image_paths, model=model_name):
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
                        await record_usage(
                            userId=aiwrapper_user["id"], requestId=request_id, outcome=outcome,
                            statusCode=status_code, errorCode=error_code, model=model_name,
                            durationMs=int((time.perf_counter() - started_at) * 1000),
                            inputTokens=max(1, len(prompt) // 4), outputTokens=max(0, len(final_text) // 4),
                        )

            return StreamingResponse(event_gen(), media_type="text/event-stream")
        else:
            final = await run_codex_last_message(prompt, overrides, image_paths, model=model_name)
            if aiwrapper_user:
                if session:
                    aiwrapper_store.append_assistant(session["id"], final)
                await record_usage(
                    userId=aiwrapper_user["id"], requestId=request_id, outcome="success", statusCode=200,
                    model=model_name, durationMs=int((time.perf_counter() - started_at) * 1000),
                    inputTokens=max(1, len(prompt) // 4), outputTokens=max(0, len(final) // 4),
                )
            resp = ChatCompletionResponse(
                choices=[ChatChoice(message=ChatMessageResponse(content=final))]
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


@app.post("/v1/responses", dependencies=[Depends(rate_limiter), Depends(verify_api_key)])
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

    prompt, image_urls = build_prompt_and_images(messages)
    if aiwrapper_user:
        raw_input = req.input if isinstance(req.input, str) else json.dumps(req.input, ensure_ascii=False)
        session = aiwrapper_store.session(aiwrapper_user["id"], req.previous_response_id, model, raw_input)
        history = aiwrapper_store.session_messages(session["id"])
        prompt, _ = build_prompt_and_images([{"role": row["role"], "content": row["content"]} for row in history])

    resp_id = f"resp_{uuid.uuid4().hex}"
    msg_id = f"msg_{uuid.uuid4().hex}"
    created = int(time.time())
    response_model = req.model or model
    codex_overrides = overrides or None

    image_paths: List[str] = []
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
                    async for text in run_codex(prompt, codex_overrides, image_paths, model=model):
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
                        await record_usage(
                            userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome=outcome,
                            statusCode=status_code, errorCode=error_code, model=model,
                            durationMs=int((time.perf_counter() - started_at) * 1000),
                            inputTokens=max(1, len(prompt) // 4), outputTokens=max(0, len(final_text) // 4),
                        )
                    yield b"data: [DONE]\n\n"

            headers = {
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            }
            return StreamingResponse(event_gen(), media_type="text/event-stream", headers=headers)
        else:
            final = await run_codex_last_message(prompt, codex_overrides, image_paths, model=model)
            if aiwrapper_user:
                if session:
                    aiwrapper_store.append_assistant(session["id"], final)
                await record_usage(
                    userId=aiwrapper_user["id"], requestId=ledger_request_id, outcome="success", statusCode=200,
                    model=model, durationMs=int((time.perf_counter() - started_at) * 1000),
                    inputTokens=max(1, len(prompt) // 4), outputTokens=max(0, len(final) // 4),
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
