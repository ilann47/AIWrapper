import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { chatCompletionSchema, messagesToInput, responsesSchema } from "../../../packages/protocol/src/openai.js";
import { encodeSse } from "../../../packages/protocol/src/sse.js";
import { CodexRuntimePool } from "../../../packages/codex-runtime/src/pool.js";
import { CodexTurns, TurnStreamEvent } from "../../../packages/codex-runtime/src/turns.js";
import { FairScheduler } from "../../../packages/queue/src/scheduler.js";
import { registry } from "../../../packages/observability/src/metrics.js";
import { config } from "./config.js";

export interface AuthPrincipal { userId: string; profileId: string; role: "user" | "operator" | "admin" | "owner" }
export interface SessionRecord{id:string;title:string;model:string;threadId?:string;status:string;createdAt:string;updatedAt:string}
export interface ServerDependencies { authenticate(token: string): Promise<AuthPrincipal | null>; reserve(principal: AuthPrincipal, estimate: number, requestId: string): Promise<{ allowed: boolean; reservationId?: string; reason?: string }>; reconcile(reservationId: string | undefined, event: TurnStreamEvent): Promise<void>; failRequest(requestId:string,cancelled:boolean,error:string):Promise<void>; resolveSession(principal:AuthPrincipal,sessionId:string|undefined,model:string):Promise<{sessionId:string;threadId?:string}>; bindThread(sessionId:string,threadId:string):Promise<void>; listSessions(principal:AuthPrincipal):Promise<SessionRecord[]>; getSession(principal:AuthPrincipal,sessionId:string):Promise<SessionRecord|null>; archiveSession(principal:AuthPrincipal,sessionId:string):Promise<void>; profile(profileId: string): Promise<{ codexHome: string; cwd: string }>; adminSummary(): Promise<Record<string, number>>; adminUsage(limit: number, offset: number): Promise<unknown[]>; adminAudit(limit: number, offset: number): Promise<unknown[]>; adminUsers():Promise<unknown[]>; createUser(input:{name:string;role:string;codexHome:string;cwd?:string}):Promise<unknown>; rotateKey(userId:string):Promise<unknown>; revokeKey(keyId:string):Promise<void>; setUserStatus(userId:string,status:string):Promise<void>; createCycle(input:{name:string;kind:string;startsAt:string;endsAt?:string}):Promise<unknown>; resetCycle(cycleId:string):Promise<unknown>; usageFor(userId:string):Promise<unknown>; exportUsage(format:"json"|"csv"):Promise<string> }

export function buildServer(deps: ServerDependencies) {
  const app = Fastify({ logger: { redact: ["req.headers.authorization", "req.body", "res.body"] }, genReqId: req => String(req.headers["x-request-id"] ?? randomUUID()) });
  const scheduler = new FairScheduler(config.GLOBAL_CONCURRENCY, config.USER_CONCURRENCY, config.QUEUE_TIMEOUT_MS);
  const pool = new CodexRuntimePool(async profileId => { const profile = await deps.profile(profileId); return { command: config.CODEX_COMMAND, args: [], cwd: profile.cwd, env: { CODEX_HOME: profile.codexHome } }; }, config.GLOBAL_CONCURRENCY);
  app.register(sensible); app.register(cors, { origin: config.CORS_ORIGINS.split(","), credentials: true }); app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onClose", async () => pool.shutdown());

  async function principal(request: any, reply: any): Promise<AuthPrincipal | undefined> {
    const value = String(request.headers.authorization ?? ""); if (!value.startsWith("Bearer ")) { reply.code(401).send({ error: { message: "Bearer token required", type: "authentication_error" } }); return; }
    const auth = await deps.authenticate(value.slice(7)); if (!auth) { reply.code(401).send({ error: { message: "Invalid API key", type: "authentication_error" } }); return; } return auth;
  }
  async function administrator(request: any, reply: any): Promise<AuthPrincipal | undefined> { const auth = await principal(request, reply); if (!auth) return; if (!new Set(["admin","owner"]).has(auth.role)) { reply.code(403).send({ error: { message: "Administrator role required", type: "authorization_error" } }); return; } return auth; }

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => ({ status: "ready" }));
  app.get("/metrics", async (_request, reply) => reply.type(registry.contentType).send(await registry.metrics()));
  app.get("/admin/summary", async (request, reply) => { if (!await administrator(request, reply)) return; return deps.adminSummary(); });
  app.get("/admin/usage", async (request: any, reply) => { if (!await administrator(request, reply)) return; const limit = Math.min(200, Math.max(1, Number(request.query?.limit ?? 50))), offset = Math.max(0, Number(request.query?.offset ?? 0)); return { data: await deps.adminUsage(limit, offset), limit, offset }; });
  app.get("/admin/audit", async (request: any, reply) => { if (!await administrator(request, reply)) return; const limit = Math.min(200, Math.max(1, Number(request.query?.limit ?? 50))), offset = Math.max(0, Number(request.query?.offset ?? 0)); return { data: await deps.adminAudit(limit, offset), limit, offset }; });
  app.get("/admin/users",async(request,reply)=>{if(!await administrator(request,reply))return;return{data:await deps.adminUsers()}});
  app.post("/admin/users",async(request:any,reply)=>{if(!await administrator(request,reply))return;const body=request.body??{};if(typeof body.name!=="string"||typeof body.codexHome!=="string")return reply.badRequest("name and codexHome are required");return reply.code(201).send(await deps.createUser({name:body.name,role:body.role??"user",codexHome:body.codexHome,cwd:body.cwd}))});
  app.patch("/admin/users/:id/status",async(request:any,reply)=>{if(!await administrator(request,reply))return;await deps.setUserStatus(request.params.id,request.body?.status);return reply.code(204).send()});
  app.post("/admin/users/:id/keys",async(request:any,reply)=>{if(!await administrator(request,reply))return;return reply.code(201).send(await deps.rotateKey(request.params.id))});
  app.delete("/admin/keys/:id",async(request:any,reply)=>{if(!await administrator(request,reply))return;await deps.revokeKey(request.params.id);return reply.code(204).send()});
  app.post("/admin/cycles",async(request:any,reply)=>{if(!await administrator(request,reply))return;return reply.code(201).send(await deps.createCycle(request.body))});
  app.post("/admin/cycles/:id/reset",async(request:any,reply)=>{if(!await administrator(request,reply))return;return reply.code(201).send(await deps.resetCycle(request.params.id))});
  app.get("/admin/export",async(request:any,reply)=>{if(!await administrator(request,reply))return;const format=request.query?.format==="csv"?"csv":"json";return reply.type(format==="csv"?"text/csv":"application/json").send(await deps.exportUsage(format))});
  app.get("/v1/me",async(request,reply)=>{const auth=await principal(request,reply);if(!auth)return;return{userId:auth.userId,profileId:auth.profileId,role:auth.role}});
  app.get("/v1/me/usage",async(request,reply)=>{const auth=await principal(request,reply);if(!auth)return;return deps.usageFor(auth.userId)});

  app.get("/v1/sessions",async(request,reply)=>{const auth=await principal(request,reply);if(!auth)return;return{data:await deps.listSessions(auth)}});
  app.post("/v1/sessions",async(request:any,reply)=>{const auth=await principal(request,reply);if(!auth)return;const model=String(request.body?.model??"gpt-5.6-sol");const session=await deps.resolveSession(auth,undefined,model);return reply.code(201).send({id:session.sessionId,model})});
  app.get("/v1/sessions/:id",async(request:any,reply)=>{const auth=await principal(request,reply);if(!auth)return;const session=await deps.getSession(auth,request.params.id);if(!session)return reply.notFound("Session not found");if(!session.threadId)return{session,thread:null};const runtime=await pool.acquire(auth.profileId);try{return{session,thread:(await runtime.request<any>("thread/read",{threadId:session.threadId,includeTurns:true})).thread}}finally{pool.release(auth.profileId)}});
  app.delete("/v1/sessions/:id",async(request:any,reply)=>{const auth=await principal(request,reply);if(!auth)return;await deps.archiveSession(auth,request.params.id);return reply.code(204).send()});

  app.get("/v1/models", async (request, reply) => { const auth = await principal(request, reply); if (!auth) return; const runtime = await pool.acquire(auth.profileId); try { return await runtime.request("model/list", {}); } finally { pool.release(auth.profileId); } });

  app.post("/v1/chat/completions", async (request, reply) => {
    const auth = await principal(request, reply); if (!auth) return; const parsed = chatCompletionSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: { message: parsed.error.message, type: "invalid_request_error" } });
    const requestId = request.id; const reservation = await deps.reserve(auth, 10_000, requestId); if (!reservation.allowed) return reply.code(429).send({ error: { message: reservation.reason, type: "quota_exceeded" } });
    const profile = await deps.profile(auth.profileId); const session=await deps.resolveSession(auth,typeof parsed.data.metadata?.session_id==="string"?parsed.data.metadata.session_id:undefined,parsed.data.model); const controller = new AbortController(); request.raw.once("close", () => controller.abort(new Error("Client disconnected")));
    const execute = async () => { const runtime = await pool.acquire(auth.profileId); const turns = new CodexTurns(runtime); try { return turns.run({threadId:session.threadId, cwd: profile.cwd, model: parsed.data.model, effort: parsed.data.reasoning_effort, input: messagesToInput(parsed.data.messages), signal: controller.signal }); } finally { /* released after stream */ } };
    const stream = await scheduler.submit({ id: requestId, userId: auth.userId, model: parsed.data.model, priority: 0, enqueuedAt: Date.now(), signal: controller.signal, run: execute });
    if (parsed.data.stream) {
      reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      try { for await (const event of stream) { await deps.reconcile(reservation.reservationId, event); if(event.type==="completed")await deps.bindThread(session.sessionId,event.result.threadId); if (event.type === "delta") reply.raw.write(encodeSse({ id: requestId, object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: event.text }, finish_reason: null }] })); } reply.raw.write(encodeSse("[DONE]")); } catch (error) { await deps.failRequest(requestId,controller.signal.aborted,(error as Error).message); reply.raw.write(encodeSse({ error: { message: (error as Error).message } })); } finally { pool.release(auth.profileId); reply.raw.end(); }
      return;
    }
    let text = ""; let final: TurnStreamEvent | undefined; try { for await (const event of stream) { if (event.type === "delta") text += event.text; if (event.type === "completed") final = event; await deps.reconcile(reservation.reservationId, event); } } catch(error){await deps.failRequest(requestId,controller.signal.aborted,(error as Error).message);throw error} finally { pool.release(auth.profileId); }
    if(final?.type==="completed")await deps.bindThread(session.sessionId,final.result.threadId);return { id: requestId, object: "chat.completion", model: parsed.data.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: final?.type === "completed" ? final.result.usage : {},metadata:{session_id:session.sessionId} };
  });

  app.post("/v1/responses", async (request, reply) => {
    const auth = await principal(request, reply); if (!auth) return; const parsed = responsesSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: { message: parsed.error.message, type: "invalid_request_error" } });
    const requestId = request.id, responseId = `resp_${requestId}`; const reservation = await deps.reserve(auth, 10_000, requestId); if (!reservation.allowed) return reply.code(429).send({ error: { message: reservation.reason, type: "quota_exceeded" } });
    const profile = await deps.profile(auth.profileId); const session=await deps.resolveSession(auth,parsed.data.previous_response_id,parsed.data.model); const controller = new AbortController(); request.raw.once("close", () => controller.abort(new Error("Client disconnected")));
    const input = typeof parsed.data.input === "string" ? [{ type: "text", role: "user", text: parsed.data.input }] : [{ type: "text", role: "user", text: JSON.stringify(parsed.data.input) }];
    const execute = async () => { const runtime = await pool.acquire(auth.profileId); const turns = new CodexTurns(runtime); return turns.run({threadId:session.threadId, cwd: profile.cwd, model: parsed.data.model, effort: parsed.data.reasoning?.effort, input, signal: controller.signal }); };
    const stream = await scheduler.submit({ id: requestId, userId: auth.userId, model: parsed.data.model, priority: 0, enqueuedAt: Date.now(), signal: controller.signal, run: execute });
    if (parsed.data.stream) {
      reply.hijack(); reply.raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      reply.raw.write(encodeSse({ id: responseId, object: "response", status: "in_progress", model: parsed.data.model }, "response.created")); let text = "";
      try { for await (const event of stream) { await deps.reconcile(reservation.reservationId, event); if(event.type==="completed")await deps.bindThread(session.sessionId,event.result.threadId); if (event.type === "delta") { text += event.text; reply.raw.write(encodeSse({ response_id: responseId, delta: event.text }, "response.output_text.delta")); } } reply.raw.write(encodeSse({ response_id: responseId, text }, "response.output_text.done")); reply.raw.write(encodeSse({ id: responseId, object: "response", status: "completed", model: parsed.data.model, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] }, "response.completed")); reply.raw.write(encodeSse("[DONE]")); } catch (error) { await deps.failRequest(requestId,controller.signal.aborted,(error as Error).message); reply.raw.write(encodeSse({ error: { message: (error as Error).message } }, "response.error")); } finally { pool.release(auth.profileId); reply.raw.end(); }
      return;
    }
    let text = ""; let final: TurnStreamEvent | undefined; try { for await (const event of stream) { if (event.type === "delta") text += event.text; if (event.type === "completed") final = event; await deps.reconcile(reservation.reservationId, event); } } catch(error){await deps.failRequest(requestId,controller.signal.aborted,(error as Error).message);throw error} finally { pool.release(auth.profileId); }
    if(final?.type==="completed")await deps.bindThread(session.sessionId,final.result.threadId);return { id: responseId, object: "response", status: "completed", model: parsed.data.model, output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }], usage: final?.type === "completed" ? final.result.usage : {},metadata:{session_id:session.sessionId} };
  });
  return app;
}
