/** Port of validation and isolation rules from Ducksss/codex-profiles bin/codex-profile.
 * Copyright (c) 2026 Chai Pin Zheng, MIT. Source commit b0df2dd.
 */
import { lstat, mkdir, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface CodexProfile { id: string; userId: string; name: string; codexHome: string; backendId: string; status: "active" | "disabled" }
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function validateProfileName(name: string): string { if (!PROFILE_NAME.test(name)) throw new Error("Invalid profile name"); return name; }

export function profileHome(root: string, userId: string, name: string): string {
  validateProfileName(name); validateProfileName(userId);
  const base = resolve(root); const target = resolve(base, userId, name);
  if (target !== base && !target.startsWith(base + sep)) throw new Error("Profile path escapes configured root");
  return target;
}

export async function ensurePrivateProfileHome(root: string, userId: string, name: string): Promise<string> {
  const target = profileHome(root, userId, name);
  try { const stat = await lstat(target); if (stat.isSymbolicLink()) throw new Error("Refusing symlinked profile directory"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(resolve(root)); const canonicalTarget = await realpath(target);
  if (!canonicalTarget.startsWith(canonicalRoot + sep)) throw new Error("Canonical profile path escapes configured root");
  return canonicalTarget;
}

export function profileEnvironment(profile: CodexProfile): NodeJS.ProcessEnv { return { CODEX_HOME: profile.codexHome }; }
