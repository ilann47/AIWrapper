import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  canonicalTextBuffer,
  hashCanonicalText,
} from "../../../scripts/provenance/canonical.mjs";

test("provenance hashes are identical for Git LF and Windows CRLF text", () => {
  const lf = Buffer.from("source\ndestination\n", "utf8");
  const crlf = Buffer.from("source\r\ndestination\r\n", "utf8");
  expect(canonicalTextBuffer(crlf)).toEqual(lf);
  expect(hashCanonicalText(crlf)).toBe(hashCanonicalText(lf));
});

test("provenance normalization preserves lone carriage returns and content", () => {
  const content = Buffer.from("source\rdestination\n", "utf8");
  expect(canonicalTextBuffer(content)).toEqual(content);
});

test("every generated provenance input and evidence file is tracked by Git", () => {
  const root = new URL("../../../", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("provenance/manifest.json", root), "utf8"));
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: fileURLToPath(root), encoding: "utf8" });
  expect(result.status).toBe(0);
  const tracked = new Set(result.stdout.split("\0").filter(Boolean).map(path => path.replaceAll("\\", "/")));
  for (const component of manifest.components) {
    for (const file of component.files) {
      expect(tracked.has(file.source)).toBeTrue();
      expect(tracked.has(file.destination)).toBeTrue();
      expect(tracked.has(file.diff)).toBeTrue();
    }
  }
});
