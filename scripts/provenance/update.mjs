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
const textExtensions = new Set([".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".toml", ".txt", ".yml", ".yaml", ".sh", ".css", ""]);
const posix = value => value.replaceAll("\\", "/");
const ignoredNames = new Set([".git", ".pytest_cache", "__pycache__", "node_modules", "dist", "coverage", ".tmp", ".aiwrapper"]);

async function writeText(path, content) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await writeFile(path, content, "utf8");
      return;
    } catch (error) {
      if (attempt >= 20 || !["UNKNOWN", "EBUSY", "EPERM"].includes(error?.code)) throw error;
      // Windows Defender and file indexers can keep a freshly generated diff
      // unavailable for several seconds. Preserve the upstream fail-closed write
      // while allowing bounded, linear backoff for those transient errors.
      await new Promise(resolveDelay => setTimeout(resolveDelay, Math.min(1_000, 100 * (attempt + 1))));
    }
  }
}

async function listFiles(dir) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(entry => !ignoredNames.has(entry.name) && !entry.name.endsWith(".pyc"));
  return (await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }))).flat();
}

async function expand(component) {
  if (component.kind === "file") return [{ source: component.source, destination: component.destination }];
  const destinationRoot = join(root, component.destination);
  const files = await listFiles(destinationRoot);
  const excluded = (component.exclude ?? []).map(value => posix(value).replace(/\/$/, ""));
  return files.filter(file => {
    if (!textExtensions.has(extname(file))) return false;
    const rel = posix(relative(destinationRoot, file));
    return !excluded.some(prefix => rel === prefix || rel.startsWith(`${prefix}/`));
  }).map(file => {
    const rel = relative(destinationRoot, file);
    return {
      source: component.kind === "reference-directory" ? component.source : posix(join(component.source, rel)),
      destination: posix(join(component.destination, rel)),
    };
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
await mkdir(join(root, "provenance", "diffs"), { recursive: true });

for (const component of config.components) {
  const files = [];
  for (const pair of await expand(component)) {
    const sourcePath = join(root, pair.source);
    const destinationPath = join(root, pair.destination);
    const [sourceBuffer, destinationBuffer] = await Promise.all([readFile(sourcePath), readFile(destinationPath)]);
    const sourceLines = sourceBuffer.toString("utf8").split(/\r?\n/);
    const destinationLines = destinationBuffer.toString("utf8").split(/\r?\n/);
    const preserved = sourceBuffer.equals(destinationBuffer) ? sourceLines.length : lcsLength(sourceLines, destinationLines);
    const sourceOnly = sourceLines.length - preserved;
    const destinationOnly = destinationLines.length - preserved;
    const changed = Math.min(sourceOnly, destinationOnly);
    const removed = sourceOnly - changed;
    const added = destinationOnly - changed;
    const reusePercent = sourceLines.length === 0 ? 100 : Number(((preserved / sourceLines.length) * 100).toFixed(2));
    const diffName = `${safeName(component.id)}--${safeName(relative(join(root, component.destination), destinationPath) || "file")}.diff`;
    const diffRelative = posix(join("provenance", "diffs", diffName));
    let diffContent;
    if (sourceBuffer.equals(destinationBuffer)) {
      // Byte-identical copied trees are the dominant case. Avoid starting one Git
      // process per file; the canonical empty unified diff is sufficient evidence.
      diffContent = "# Files are identical.\n";
    } else {
      const result = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--", sourcePath, destinationPath], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
      if (![0, 1].includes(result.status ?? 2)) throw new Error(`git diff failed for ${pair.destination}: ${result.stderr}`);
      diffContent = result.stdout || "# Files are identical.\n";
    }
    await mkdir(dirname(join(root, diffRelative)), { recursive: true });
    await writeText(join(root, diffRelative), diffContent);
    files.push({
      source: posix(pair.source), destination: posix(pair.destination), sourceCommit: component.sourceCommit,
      license: component.license, sourceSha256: hash(sourceBuffer), sha256: hash(destinationBuffer), diff: diffRelative, diffSha256: hash(diffContent),
      lines: { source: sourceLines.length, destination: destinationLines.length, preserved, changed, removed, added, reusePercent },
    });
  }
  manifest.components.push({ id: component.id, functionality: component.functionality, project: component.project, classification: component.classification, referenceOnly: component.referenceOnly ?? false, incompatibility: component.incompatibility ?? null, parityAudit: component.parityAudit ?? null, files });
}

const manifestPath = join(root, "provenance", "manifest.json");
await writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const componentRows = manifest.components.map(component => {
  const totals = component.files.reduce((sum, file) => ({
    source: sum.source + file.lines.source,
    destination: sum.destination + file.lines.destination,
    preserved: sum.preserved + file.lines.preserved,
    changed: sum.changed + file.lines.changed,
    removed: sum.removed + file.lines.removed,
    added: sum.added + file.lines.added,
  }), { source: 0, destination: 0, preserved: 0, changed: 0, removed: 0, added: 0 });
  const reusePercent = totals.source === 0 ? 100 : Number(((totals.preserved / totals.source) * 100).toFixed(2));
  const firstFile = component.files[0];
  const configured = config.components.find(candidate => candidate.id === component.id);
  const status = component.referenceOnly ? `${component.classification} (reference only)` : component.classification;
  const diffLabel = component.files.length === 1 ? "diff" : `${component.files.length} diffs`;
  const diffTarget = component.files.length === 1 ? `../../${firstFile.diff}` : "#file-level-evidence";
  return `| ${component.project} | ${component.functionality} | ${status} | \`${configured.source}\` | \`${configured.destination}\` | \`${firstFile.sourceCommit.slice(0, 12)}\` | ${firstFile.license} | ${totals.preserved} | ${totals.changed} | ${totals.removed} | ${totals.added} | ${reusePercent}% | [${diffLabel}](${diffTarget}) |`;
});
const rows = manifest.components.flatMap(component => component.files.map(file =>
  `| ${component.functionality} | \`${file.source}\` | \`${file.destination}\` | \`${file.sourceCommit.slice(0, 12)}\` | ${file.license} | ${file.lines.preserved} | ${file.lines.changed} | ${file.lines.removed} | ${file.lines.added} | ${file.lines.reusePercent}% | [diff](../../${file.diff}) |`,
));
const report = `# Provenance evidence (generated)\n\nDo not edit manually. Generated by \`pnpm provenance:update\`. Reuse is measured as preserved source lines divided by total source lines; every aggregate links to the exact file-level unified diffs below.\n\n## Component summary\n\n| Project | Functionality | Classification / status | Origin | Destination | Commit | License | Preserved | Changed | Removed | Added | Reuse | Diff evidence |\n|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|\n${componentRows.join("\n")}\n\n## File-level evidence\n\n| Functionality | Origin | Destination | Commit | License | Preserved | Changed | Removed | Added | Reuse | Diff |\n|---|---|---|---|---|---:|---:|---:|---:|---:|---|\n${rows.join("\n")}\n`;
await writeText(join(root, "docs", "generated", "PROVENANCE_EVIDENCE.md"), report);
console.log(`Updated provenance for ${componentRows.length} component(s), ${rows.length} file mapping(s)`);
