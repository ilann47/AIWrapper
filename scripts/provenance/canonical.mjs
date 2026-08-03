import { createHash } from "node:crypto";

/**
 * Git stores the provenance inputs as text. Normalize only CRLF so a manifest
 * generated on Windows verifies the same committed bytes on Linux and macOS.
 */
export function canonicalTextBuffer(content) {
  const value = Buffer.isBuffer(content) ? content.toString("utf8") : String(content);
  return Buffer.from(value.replaceAll("\r\n", "\n"), "utf8");
}

export function hashCanonicalText(content) {
  return createHash("sha256").update(canonicalTextBuffer(content)).digest("hex");
}
