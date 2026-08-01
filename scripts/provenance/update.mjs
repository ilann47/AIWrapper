#!/usr/bin/env node
/**
 * Adapted from codex-multi-auth/scripts/update-vendor-provenance.mjs (MIT,
 * commit 89ca9696d0f46cce48b28fdaa64a62d4bb521874).
 * Preserved architecture: declarative components -> SHA-256 manifest writer.
 * AIWrapper additions: source/destination pairs, LCS line metrics, reuse ratio,
 * unified diffs and Markdown evidence report.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..", "..");
const config = JSON.parse(await readFile(join(root, "provenance", "components.json"), "utf8"));
const textExtensions = new Set([".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".toml", ".txt", ".yml", ".yaml", ".sh", ""]);
const posix = value => value.replaceAll("\\", "/");

async function listFiles(dir) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(entry => !new Set(["__pycache__", ".pytest_cache"]).has(entry.name) && !entry.name.endsWith(".pyc"));
  return (await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }))).flat();
}

async function expand(component) {
  if (component.kind !== "directory") return [{ source: component.source, destination: component.destination }];
  const destinationRoot = join(root, component.destination);
  const files = await listFiles(destinationRoot);
  return files.filter(file => textExtensions.has(extname(file))).map(file => {
    const rel = relative(destinationRoot, file);
    return { source: posix(join(component.source, rel)), destination: posix(join(component.destination, rel)) };
  });
}

function lcsLength(a, b) {
  let previous = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j += 1) current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    previous = current;
  }
  return previous[b.length];
}

const hash = content => createHash("sha256").update(content).digest("hex");
const safeName = value => value.replaceAll(/[^a-zA-Z0-9._-]+/g, "_");
const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), generatorUpstream: config.generatorUpstream, components: [] };

for (const component of config.components) {
  const files = [];
  for (const pair of await expand(component)) {
    const sourcePath = join(root, pair.source);
    const destinationPath = join(root, pair.destination);
    const [sourceBuffer, destinationBuffer] = await Promise.all([readFile(sourcePath), readFile(destinationPath)]);
    const sourceLines = sourceBuffer.toString("utf8").split(/\r?\n/);
    const destinationLines = destinationBuffer.toString("utf8").split(/\r?\n/);
    const preserved = lcsLength(sourceLines, destinationLines);
    const sourceOnly = sourceLines.length - preserved;
    const destinationOnly = destinationLines.length - preserved;
    const changed = Math.min(sourceOnly, destinationOnly);
    const removed = sourceOnly - changed;
    const added = destinationOnly - changed;
    const reusePercent = sourceLines.length === 0 ? 100 : Number(((preserved / sourceLines.length) * 100).toFixed(2));
    const diffName = `${safeName(component.id)}--${safeName(relative(join(root, component.destination), destinationPath) || "file")}.diff`;
    const diffRelative = posix(join("provenance", "diffs", diffName));
    const result = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--", sourcePath, destinationPath], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (![0, 1].includes(result.status ?? 2)) throw new Error(`git diff failed for ${pair.destination}: ${result.stderr}`);
    await mkdir(dirname(join(root, diffRelative)), { recursive: true });
    const diffContent = result.stdout || "# Files are identical.\n";
    await writeFile(join(root, diffRelative), diffContent, "utf8");
    files.push({
      source: posix(pair.source), destination: posix(pair.destination), sourceCommit: component.sourceCommit,
      license: component.license, sourceSha256: hash(sourceBuffer), sha256: hash(destinationBuffer), diff: diffRelative, diffSha256: hash(diffContent),
      lines: { source: sourceLines.length, destination: destinationLines.length, preserved, changed, removed, added, reusePercent },
    });
  }
  manifest.components.push({ id: component.id, functionality: component.functionality, project: component.project, classification: component.classification, incompatibility: component.incompatibility ?? null, parityAudit: component.parityAudit ?? null, files });
}

const manifestPath = join(root, "provenance", "manifest.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const rows = manifest.components.flatMap(component => component.files.map(file =>
  `| ${component.functionality} | \`${file.source}\` | \`${file.destination}\` | \`${file.sourceCommit.slice(0, 12)}\` | ${file.license} | ${file.lines.preserved} | ${file.lines.changed} | ${file.lines.removed} | ${file.lines.added} | ${file.lines.reusePercent}% | [diff](../../${file.diff}) |`,
));
const report = `# Provenance evidence (generated)\n\nDo not edit manually. Generated by \`pnpm provenance:update\`.\n\n| Functionality | Origin | Destination | Commit | License | Preserved | Changed | Removed | Added | Reuse | Diff |\n|---|---|---|---|---|---:|---:|---:|---:|---:|---|\n${rows.join("\n")}\n`;
await writeFile(join(root, "docs", "generated", "PROVENANCE_EVIDENCE.md"), report, "utf8");
console.log(`Updated provenance for ${manifest.components.length} component(s), ${rows.length} file mapping(s)`);
