import { describe, expect, it } from "vitest";
import { encodeSse, nextSseBlock, sseDataPayload } from "../packages/protocol/src/sse.js";
describe("OpenCodex SSE framing",()=>{it("parses multi-line payloads",()=>expect(sseDataPayload("event: x\ndata: one\ndata: two")).toBe("one\ntwo"));it("preserves delimiter",()=>expect(nextSseBlock("data: x\r\n\r\nrest")?.delimiter).toBe("\r\n\r\n"));it("encodes named events",()=>expect(encodeSse({ok:true},"ready")).toContain("event: ready\ndata:"))});
