import secrets
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app import store
from app.backends import codex_login_status, codex_models, complete
from app.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_db()
    yield


app = FastAPI(title="AIWrapper Lab", version="0.1.0", lifespan=lifespan)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80, pattern=r"^[a-zA-Z0-9_.-]+$")
    primary_limit: int = Field(default=settings.default_primary_limit, gt=0)
    secondary_limit: int = Field(default=settings.default_secondary_limit, gt=0)
    rpm: int = Field(default=30, ge=1, le=600)


class UserLimitsUpdate(BaseModel):
    primary_limit: int = Field(gt=0)
    secondary_limit: int = Field(gt=0)
    rpm: int = Field(ge=1, le=600)


class SessionCreate(BaseModel):
    title: str = Field(default="Nova conversa", min_length=1, max_length=120)
    model: str = "gpt-5.6-sol"
    reasoning_effort: str | None = None


class SessionMessage(BaseModel):
    content: str = Field(min_length=1, max_length=100_000)
    model: str
    reasoning_effort: str | None = None
    speed: str = Field(default="standard", pattern="^(standard|fast)$")


def bearer(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Bearer token obrigatório")
    return authorization[7:]


def current_user(token: str = Depends(bearer)) -> store.User:
    user = store.get_user_by_key(token)
    if not user or not user.enabled:
        raise HTTPException(401, "Chave inválida ou desativada")
    return user


def admin(request: Request, authorization: str | None = Header(default=None)) -> None:
    client_host = request.client.host if request.client else ""
    if settings.local_admin_no_key and client_host in {"127.0.0.1", "::1", "localhost"}:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Chave administrativa obrigatória fora do localhost")
    if not secrets.compare_digest(authorization[7:], settings.admin_key):
        raise HTTPException(403, "Chave administrativa inválida")


def enforce(user: store.User) -> dict:
    usage = store.usage_summary(user)
    if usage["blocked"]:
        raise HTTPException(429, {"error": "quota_exceeded", "usage": usage})
    if usage["requests_last_minute"] >= user.rpm:
        raise HTTPException(429, {"error": "rate_limit_exceeded", "usage": usage})
    return usage


@app.get("/health")
def health():
    return {"status": "ok", "backend": settings.backend}


@app.get("/admin/codex/status", dependencies=[Depends(admin)])
async def codex_status():
    return await codex_login_status()


@app.get("/admin/codex/models", dependencies=[Depends(admin)])
async def available_codex_models():
    return {"data": await codex_models()}


@app.post("/admin/users", dependencies=[Depends(admin)])
def add_user(body: UserCreate):
    try:
        user, key = store.create_user(body.name, body.primary_limit, body.secondary_limit, body.rpm)
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(409, "Usuário já existe") from exc
        raise
    return {"user": user, "api_key": key, "warning": "A chave só é exibida uma vez."}


@app.get("/admin/users", dependencies=[Depends(admin)])
def users():
    result = []
    for item in store.list_users():
        user = store.User(item["id"], item["name"], bool(item["enabled"]), item["primary_limit"], item["secondary_limit"], item["rpm"])
        result.append({**item, "usage": store.usage_summary(user)})
    return result


@app.patch("/admin/users/{user_id}", dependencies=[Depends(admin)])
def change_user_limits(user_id: int, body: UserLimitsUpdate):
    user = store.update_user_limits(user_id, body.primary_limit, body.secondary_limit, body.rpm)
    if not user:
        raise HTTPException(404, "Usuário não encontrado")
    return user


@app.get("/v1/me/usage")
def my_usage(user: store.User = Depends(current_user)):
    return store.usage_summary(user)


@app.post("/v1/sessions")
def new_session(body: SessionCreate, user: store.User = Depends(current_user)):
    return store.create_session(str(uuid.uuid4()), user.id, body.title, body.model, body.reasoning_effort)


@app.get("/v1/sessions")
def sessions(user: store.User = Depends(current_user)):
    return store.list_sessions(user.id)


@app.get("/v1/sessions/{session_id}")
def session_detail(session_id: str, user: store.User = Depends(current_user)):
    session = store.get_session(session_id, user.id)
    if not session:
        raise HTTPException(404, "Sessão não encontrada")
    return session


@app.post("/v1/sessions/{session_id}/messages")
async def session_message(session_id: str, body: SessionMessage, user: store.User = Depends(current_user)):
    enforce(user)
    session = store.get_session(session_id, user.id)
    if not session:
        raise HTTPException(404, "Sessão não encontrada")
    payload = {"model": body.model, "reasoning_effort": body.reasoning_effort, "speed": body.speed, "messages": [{"role": "user", "content": body.content}], "codex_thread_id": session.get("codex_thread_id")}
    started_at = time.perf_counter()
    store.add_message(session_id, "user", body.content, body.model, body.reasoning_effort)
    try:
        result = await complete(payload)
    except Exception as exc:
        raise HTTPException(502, f"Falha no backend: {exc}") from exc
    processing_ms = round((time.perf_counter() - started_at) * 1000)
    if result.thread_id and not session.get("codex_thread_id"):
        store.set_codex_thread(session_id, result.thread_id)
    store.add_message(session_id, "assistant", result.content, body.model, body.reasoning_effort, processing_ms)
    request_id = "chatcmpl-" + uuid.uuid4().hex
    units = store.record_usage(request_id, user.id, body.model, result.input_tokens, result.output_tokens, "success")
    return {"session_id": session_id, "codex_thread_id": result.thread_id, "message": {"role": "assistant", "content": result.content}, "usage": {"prompt_tokens": result.input_tokens, "completion_tokens": result.output_tokens, "weighted_units": units}, "timing": {"processing_ms": processing_ms, "processing_seconds": round(processing_ms / 1000, 2)}, "speed": body.speed}


@app.get("/v1/models")
async def models(_: store.User = Depends(current_user)):
    if settings.backend == "codex":
        return {"object": "list", "data": [{"id": m["id"], "object": "model", "name": m.get("displayName"), "description": m.get("description")} for m in await codex_models()]}
    return {"object": "list", "data": [{"id": "lab-model", "object": "model"}]}


@app.post("/v1/chat/completions")
async def chat(payload: dict, user: store.User = Depends(current_user)):
    started_at = time.perf_counter()
    enforce(user)
    if payload.get("stream"):
        raise HTTPException(400, "Streaming será adicionado na próxima versão")
    request_id = "chatcmpl-" + uuid.uuid4().hex
    model = str(payload.get("model", "lab-model"))
    reasoning_effort = str(payload.get("reasoning_effort", "")) or None
    try:
        result = await complete(payload)
        status = "success"
    except Exception as exc:
        raise HTTPException(502, f"Falha no backend: {exc}") from exc
    units = store.record_usage(request_id, user.id, model, result.input_tokens, result.output_tokens, status)
    processing_ms = round((time.perf_counter() - started_at) * 1000)
    return {
        "id": request_id, "object": "chat.completion", "created": int(time.time()), "model": model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": result.content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": result.input_tokens, "completion_tokens": result.output_tokens, "total_tokens": result.input_tokens + result.output_tokens, "weighted_units": units},
        "timing": {"processing_ms": processing_ms, "processing_seconds": round(processing_ms / 1000, 2)},
        "reasoning_effort": reasoning_effort,
    }


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    return HTMLResponse((Path(__file__).parent / "dashboard.html").read_text(encoding="utf-8"))


DASHBOARD = """<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>AIWrapper Lab</title><style>
body{font:15px system-ui;background:#0b1020;color:#e8ecf4;max-width:980px;margin:40px auto;padding:0 20px}h1{font-size:28px}.card{background:#151c31;border:1px solid #26304e;border-radius:14px;padding:18px;margin:12px 0}.bar{height:12px;background:#252d43;border-radius:8px;overflow:hidden}.fill{height:100%;background:#65d6a6}.bad{background:#ff6b6b}input,button{padding:10px;border-radius:8px;border:1px solid #3c4869;background:#101629;color:white}button{cursor:pointer}small{color:#9ca8c4}</style></head><body><h1>AIWrapper Lab</h1><p id='auth'>Verificando o login do ChatGPT pelo Codex…</p><details><summary>Acesso remoto</summary><p>Fora do localhost, informe a chave administrativa.</p><input id='key' type='password' placeholder='Admin key'></details><button onclick='load()'>Atualizar</button><div id='out'></div><script>
function headers(){let k=document.querySelector('#key').value;return k?{Authorization:'Bearer '+k}:{}}
async function status(){let r=await fetch('/admin/codex/status',{headers:headers()});if(r.ok){let s=await r.json();auth.textContent=s.authenticated?'Conectado à sua conta ChatGPT pelo Codex.':'Codex não autenticado. Execute: codex login';}else auth.textContent='Acesso administrativo não autorizado.'}
async function load(){let r=await fetch('/admin/users',{headers:headers()});if(!r.ok){out.innerHTML='<p>Falha: '+r.status+'</p>';return}let xs=await r.json();out.innerHTML=xs.map(x=>{let u=x.usage,p=u.primary,s=u.secondary;return `<div class=card><h2>${x.name}</h2><small>${x.key_prefix}… · ${x.rpm} req/min</small><p>Janela primária: ${p.used_percent}% (${p.used_units}/${p.limit_units})</p><div class=bar><div class='fill ${p.used_percent>=100?'bad':''}' style='width:${Math.min(p.used_percent,100)}%'></div></div><p>Janela secundária: ${s.used_percent}% (${s.used_units}/${s.limit_units})</p><div class=bar><div class='fill ${s.used_percent>=100?'bad':''}' style='width:${Math.min(s.used_percent,100)}%'></div></div></div>`}).join('')} status();load();
</script></body></html>"""
