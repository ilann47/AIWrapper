import { expect, test } from "bun:test";
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

