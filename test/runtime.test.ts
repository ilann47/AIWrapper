import{EventEmitter}from"node:events";
import{describe,expect,it}from"vitest";
import{CodexAppServer}from"../packages/codex-runtime/src/json-rpc.js";
import{CodexTurns}from"../packages/codex-runtime/src/turns.js";
describe("persistent runtime",()=>{
 it("starts disconnected",()=>expect(new CodexAppServer({command:"codex"}).alive).toBe(false));
 it("rejects calls before startup",async()=>await expect(new CodexAppServer({command:"codex"}).request("x")).rejects.toThrow("not running"));
 it("resumes a persisted thread before appending a turn",async()=>{
  class Fake extends EventEmitter{calls:string[]=[];async request(method:string){this.calls.push(method);if(method==="turn/start"){setTimeout(()=>this.emit("event",{method:"turn/completed",params:{threadId:"thread-1",turn:{id:"turn-1"}}}),0);return{turn:{id:"turn-1"}}}return{thread:{id:"thread-1"}}}}
  const fake=new Fake(),events=[];for await(const event of new CodexTurns(fake as never).run({threadId:"thread-1",cwd:".",model:"model",input:[{type:"text",role:"user",text:"hi"}]}))events.push(event);
  expect(fake.calls.slice(0,2)).toEqual(["thread/resume","turn/start"]);expect(events.at(-1)?.type).toBe("completed");
 });
});
