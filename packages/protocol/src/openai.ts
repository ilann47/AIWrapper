/** Contract port based on circlemouth/Codex-Wrapper app/schemas.py and app/prompt.py.
 * Copyright (c) 2025 circlemouth, MIT. Source commit e9353b8.
 */
import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

export const chatCompletionSchema = z.object({
  model: z.string().min(1), messages: z.array(chatMessageSchema).min(1),
  stream: z.boolean().default(false), tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(), reasoning_effort: z.string().optional(),
  user: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
});

export const responsesSchema = z.object({
  model: z.string().min(1), input: z.union([z.string(), z.array(z.unknown())]),
  stream: z.boolean().default(false), tools: z.array(z.unknown()).optional(),
  reasoning: z.object({ effort: z.string().optional() }).optional(),
  previous_response_id: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChatCompletionRequest = z.infer<typeof chatCompletionSchema>;
export type ResponsesRequest = z.infer<typeof responsesSchema>;

export function messagesToInput(messages: ChatCompletionRequest["messages"]): Array<Record<string, unknown>> {
  return messages.map(message => ({ type: "text", role: message.role, text: typeof message.content === "string" ? message.content : JSON.stringify(message.content) }));
}
