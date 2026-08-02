// Adapted from 9router BasicChatPageClient.js. The data and UI layers consume
// these upstream helpers through AIWrapper's authenticated transport boundary.
export function createChatId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as { message?: unknown; error?: unknown };
    if (typeof record.message === "string") return record.message;
    if (typeof record.error === "string") return record.error;
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

export function formatRelativeTime(value?: string): string {
  if (!value) return "now";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "now";
  const diffMinutes = Math.max(1, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.round(diffHours / 24)}d`;
}

export function makeSessionTitle(text = ""): string {
  const normalized = textValue(text).replace(/\s+/g, " ").trim();
  if (!normalized) return "New chat";
  return normalized.length > 52 ? `${normalized.slice(0, 52).trimEnd()}…` : normalized;
}

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export function buildUserContent(text: string, attachments: readonly ChatAttachment[]): unknown {
  if (attachments.length === 0) return text;
  const content: unknown[] = [];
  if (text) content.push({ type: "text", text });
  for (const attachment of attachments) {
    if (attachment.dataUrl) content.push({ type: "image_url", image_url: { url: attachment.dataUrl } });
  }
  return content.length > 0 ? content : text;
}
