import { z } from "zod";
const schema = z.object({
  PORT: z.coerce.number().default(8080), HOST: z.string().default("127.0.0.1"),
  CODEX_COMMAND: z.string().default("codex"), CODEX_WORKDIR: z.string().default(process.cwd()), CODEX_PROFILE_ROOT: z.string().default("./data/profiles"),
  API_KEY_PEPPER: z.string().min(32).default("development-only-pepper-change-me-123456789"),
  DATABASE_URL: z.string().default("postgres://aiwrapper:aiwrapper@127.0.0.1:5432/aiwrapper"), REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  GLOBAL_CONCURRENCY: z.coerce.number().int().positive().default(4), USER_CONCURRENCY: z.coerce.number().int().positive().default(1), QUEUE_TIMEOUT_MS: z.coerce.number().positive().default(60_000),
  CORS_ORIGINS: z.string().default("http://127.0.0.1:5173,http://localhost:5173"),
});
export const config = schema.parse(process.env);
