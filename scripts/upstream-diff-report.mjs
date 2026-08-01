import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "upstream", "Codex-Wrapper");
const destinationRoot = join(root, "services", "codex-wrapper");

async function files(dir) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter(entry => entry.name !== "__pycache__" && !entry.name.endsWith(".pyc"));
  return (await Promise.all(entries.map(async entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }))).flat();
}

const rows = [];
function lcsLength(a, b) {
  let previous = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Uint32Array(b.length + 1);
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1] + 1
        : Math.max(previous[j], current[j - 1]);
    }
    previous = current;
  }
  return previous[b.length];
}

for (const destination of (await files(destinationRoot)).sort()) {
  const rel = relative(destinationRoot, destination).replaceAll("\\", "/");
  const source = join(sourceRoot, rel);
  let sourceText;
  try { sourceText = await readFile(source, "utf8"); } catch { continue; }
  const destinationText = await readFile(destination, "utf8");
  const sourceRows = sourceText.length === 0 ? [] : sourceText.split(/\r?\n/);
  const destinationRows = destinationText.length === 0 ? [] : destinationText.split(/\r?\n/);
  const preserved = lcsLength(sourceRows, destinationRows);
  const removed = sourceRows.length - preserved;
  const inserted = destinationRows.length - preserved;
  const changed = Math.min(removed, inserted);
  const added = Math.max(0, inserted - changed);
  rows.push(`| \`${rel}\` | ${sourceRows.length} | ${preserved} | ${changed} | ${added} |`);
}

const output = `# Generated upstream diff report\n\n| File | Source lines | Preserved | Changed | Added |\n|---|---:|---:|---:|---:|\n${rows.join("\n")}\n`;
const target = join(root, "docs", "generated", "UPSTREAM_DIFF_REPORT.md");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output, "utf8");
console.log(`Wrote ${relative(root, target)} (${rows.length} compared files)`);
