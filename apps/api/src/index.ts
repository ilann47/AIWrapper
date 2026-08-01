import { buildServer } from "./server.js";
import { config } from "./config.js";
import { PlatformRepository } from "../../../packages/db/src/repository.js";

const repository = new PlatformRepository(config.DATABASE_URL, config.API_KEY_PEPPER);
const app = buildServer(repository);
await app.listen({ host: config.HOST, port: config.PORT });

const shutdown = async () => { await app.close(); await repository.pool.end(); process.exit(0); };
process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
