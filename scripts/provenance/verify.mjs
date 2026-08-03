#!/usr/bin/env node
/** Adapted from codex-multi-auth/scripts/verify-vendor-provenance.mjs (MIT, 89ca9696). */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashCanonicalText } from "./canonical.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const manifest = JSON.parse(await readFile(new URL("../../provenance/manifest.json", import.meta.url), "utf8"));
if (!manifest || !Array.isArray(manifest.components)) throw new Error("provenance/manifest.json is missing a valid components array");
const classifications = new Set(["copied", "directly imported", "adapter", "imported-not-wired", "IMPLEMENTAÇÃO PRÓPRIA"]);

let count = 0;
for (const component of manifest.components) {
  if (!component?.id || !component?.functionality || !Array.isArray(component.files) || component.files.length === 0) throw new Error(`Invalid provenance component: ${JSON.stringify(component)}`);
  if (!classifications.has(component.classification)) throw new Error(`Invalid literal classification for ${component.id}: ${component.classification}`);
  if (component.classification === "IMPLEMENTAÇÃO PRÓPRIA" && (!component.referenceOnly || typeof component.incompatibility !== "string" || component.incompatibility.length < 30)) {
    throw new Error(`Own implementation ${component.id} must document its reviewed upstream reference and concrete incompatibility`);
  }
  for (const file of component.files) {
    for (const required of ["source", "destination", "sourceCommit", "license", "sourceSha256", "sha256", "diff", "diffSha256", "lines"]) if (file[required] === undefined) throw new Error(`Missing ${required} in ${component.id}`);
    const content = await readFile(resolve(root, file.destination));
    const actual = hashCanonicalText(content);
    if (actual !== file.sha256) throw new Error(`Provenance mismatch for ${file.destination}; run pnpm provenance:update`);
    const source = await readFile(resolve(root, file.source));
    const sourceActual = hashCanonicalText(source);
    if (sourceActual !== file.sourceSha256) throw new Error(`Upstream source mismatch for ${file.source}; pin or regenerate provenance`);
    const diff = await readFile(resolve(root, file.diff));
    const diffActual = hashCanonicalText(diff);
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
