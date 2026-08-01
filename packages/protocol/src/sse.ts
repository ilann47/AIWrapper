/**
 * Adapted from OpenCodex src/server/sse-payload-rewrite.ts.
 * Copyright (c) 2026 opencodex contributors, MIT License.
 * Source commit: d1f544bbc22d25b9b2bd3c8e776fb8e3242b4ed5.
 */
export type SsePayloadRewrite = (payload: string) => string;

export function nextSseBlock(buffer: string): { block: string; delimiter: string; rest: string } | null {
  const match = buffer.match(/\r?\n\r?\n/);
  if (!match || match.index === undefined) return null;
  return { block: buffer.slice(0, match.index), delimiter: match[0], rest: buffer.slice(match.index + match[0].length) };
}

export function sseDataPayload(block: string): string | null {
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5);
    data.push(value.startsWith(" ") ? value.slice(1) : value);
  }
  return data.length > 0 ? data.join("\n") : null;
}

export function encodeSse(data: unknown, event?: string): string {
  const prefix = event ? `event: ${event}\n` : "";
  return `${prefix}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
}

export async function* relaySseWithPayloadRewrite(
  source: AsyncIterable<string>, rewrite: SsePayloadRewrite,
): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of source) {
    buffer += chunk;
    let next: ReturnType<typeof nextSseBlock>;
    while ((next = nextSseBlock(buffer))) {
      buffer = next.rest;
      const payload = sseDataPayload(next.block);
      yield payload ? `data: ${rewrite(payload)}${next.delimiter}` : next.block + next.delimiter;
    }
  }
  if (buffer) yield buffer;
}
