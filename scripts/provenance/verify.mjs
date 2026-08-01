#!/usr/bin/env node
/** Adapted from codex-multi-auth/scripts/verify-vendor-provenance.mjs (MIT, 89ca9696). */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(await readFile(new URL("../../provenance/manifest.json", import.meta.url), "utf8"));
if (!manifest || !Array.isArray(manifest.components)) throw new Error("provenance/manifest.json is missing a valid components array");

let count = 0;
for (const component of manifest.components) {
  if (!component?.id || !component?.functionality || !Array.isArray(component.files) || component.files.length === 0) throw new Error(`Invalid provenance component: ${JSON.stringify(component)}`);
  for (const file of component.files) {
    for (const required of ["source", "destination", "sourceCommit", "license", "sourceSha256", "sha256", "diff", "diffSha256", "lines"]) if (file[required] === undefined) throw new Error(`Missing ${required} in ${component.id}`);
    const content = await readFile(resolve(root, file.destination));
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== file.sha256) throw new Error(`Provenance mismatch for ${file.destination}; run pnpm provenance:update`);
    const source = await readFile(resolve(root, file.source));
    const sourceActual = createHash("sha256").update(source).digest("hex");
    if (sourceActual !== file.sourceSha256) throw new Error(`Upstream source mismatch for ${file.source}; pin or regenerate provenance`);
    const diff = await readFile(resolve(root, file.diff));
    const diffActual = createHash("sha256").update(diff).digest("hex");
    if (diffActual !== file.diffSha256) throw new Error(`Stored diff mismatch for ${file.diff}; run pnpm provenance:update`);
    if (typeof file.lines.reusePercent !== "number" || file.lines.reusePercent < 0 || file.lines.reusePercent > 100) throw new Error(`Invalid reuse percentage for ${file.destination}`);
    if (file.lines.source > file.lines.destination * 2 && file.lines.reusePercent < 50) {
      const audit = component.parityAudit;
      if (!audit || !Array.isArray(audit.retained) || !Array.isArray(audit.lost) || typeof audit.decision !== "string" || audit.decision.length < 20) {
        throw new Error(`Low-reuse replacement ${component.id} requires retained/lost/decision parity audit`);
      }
    }
    count += 1;
  }
}
console.log(`Provenance ok: ${manifest.components.length} component(s), ${count} mapping(s) verified`);
