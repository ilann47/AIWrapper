import { describe, expect, it } from "vitest";
import { evaluateBudgetGuard, getBudgetWindowStart, weightedUnits } from "../packages/quota/src/budget.js";
const usage={requests:0,input_tokens:0,output_tokens:0,weighted_units:900,cost_micros:0,duration_ms:0,percent:0};
describe("budget guard adapted from codex-multi-auth",()=>{
 it("blocks a hard limit before execution",()=>expect(evaluateBudgetGuard({id:"x",subjectType:"user",subjectId:"u",metric:"weighted_units",limit:1000,mode:"hard",warningPercent:80,tolerance:0,window:"day"},usage,101).allowed).toBe(false));
 it("allows a soft limit and warns",()=>{const result=evaluateBudgetGuard({id:"x",subjectType:"user",subjectId:"u",metric:"weighted_units",limit:1000,mode:"soft",warningPercent:80,tolerance:0,window:"day"},usage,200);expect(result.allowed).toBe(true);expect(result.warned).toBe(true)});
 it("weights cached and output tokens",()=>expect(weightedUnits(100,20,40,10)).toBe(190));
 it("starts weekly cycles on Monday",()=>expect(new Date(getBudgetWindowStart("week",Date.UTC(2026,7,1))).getUTCDay()).toBe(1));
});
