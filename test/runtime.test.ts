import{describe,expect,it,vi}from"vitest";import{CodexAppServer}from"../packages/codex-runtime/src/json-rpc.js";
describe("persistent runtime",()=>{it("starts disconnected",()=>expect(new CodexAppServer({command:"codex"}).alive).toBe(false));it("rejects calls before startup",async()=>await expect(new CodexAppServer({command:"codex"}).request("x")).rejects.toThrow("not running"))});
