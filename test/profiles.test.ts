import { describe, expect, it } from "vitest";
import { profileHome, validateProfileName } from "../packages/profiles/src/profiles.js";
describe("profile isolation ported from codex-profiles",()=>{it("accepts safe names",()=>expect(validateProfileName("work-1")).toBe("work-1"));it("rejects traversal",()=>expect(()=>validateProfileName("../secret")).toThrow());it("keeps homes inside root",()=>expect(profileHome("C:/profiles","user1","work").toLowerCase()).toContain("profiles"))});
