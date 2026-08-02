#!/usr/bin/env node
/**
 * Process boundary for unmodified 9router runtime modules.
 * Compression and capability detection execute directly from upstream/9router.
 */
import { compressMessages, formatRtkLog } from "../../../upstream/9router/open-sse/rtk/index.js";
import { injectCaveman } from "../../../upstream/9router/open-sse/rtk/caveman.js";
import { injectPonytail } from "../../../upstream/9router/open-sse/rtk/ponytail.js";
import { detectRequiredCapabilities } from "../../../upstream/9router/open-sse/services/combo.js";
import { backupDbLite, makeBackupDir, pruneOldBackups } from "./nine-router-db-backup.mjs";
import { getSettings, updateSettings } from "./nine-router-settings-repo.mjs";

const operation = process.argv[2];
const input = JSON.parse(await new Promise((resolve, reject) => {
  let body = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => { body += chunk; });
  process.stdin.on("end", () => resolve(body || "{}"));
  process.stdin.on("error", reject);
}));

let result;
if (operation === "compress") {
  const body = structuredClone(input.body ?? {});
  const runtimeSettings = await getSettings();
  const stats = compressMessages(body, input.enabled !== false && runtimeSettings.rtkEnabled !== false);
  const transforms = [];
  if (runtimeSettings.cavemanEnabled && runtimeSettings.cavemanLevel) {
    injectCaveman(body, "openai", runtimeSettings.cavemanLevel);
    transforms.push(`CAVEMAN:${runtimeSettings.cavemanLevel}`);
  }
  if (runtimeSettings.ponytailEnabled && runtimeSettings.ponytailLevel) {
    injectPonytail(body, "openai", runtimeSettings.ponytailLevel);
    transforms.push(`PONYTAIL:${runtimeSettings.ponytailLevel}`);
  }
  result = { body, stats, transforms, log: formatRtkLog(stats) };
} else if (operation === "capabilities") {
  result = { required: [...detectRequiredCapabilities(input.body ?? {})] };
} else if (operation === "settings:get") {
  result = await getSettings();
} else if (operation === "settings:update") {
  result = await updateSettings(input.updates ?? {});
} else if (operation === "backup") {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(input.databasePath);
  const adapter = {
    exec(sql) { database.exec(sql); },
    all(sql) { return database.prepare(sql).all(); },
    transaction(callback) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const value = callback();
        database.exec("COMMIT");
        return value;
      } catch (error) {
        try { database.exec("ROLLBACK"); } catch {}
        throw error;
      }
    },
  };
  try {
    const directory = makeBackupDir(input.label || "manual");
    const backupPath = backupDbLite(adapter, directory, "aiwrapper.sqlite");
    pruneOldBackups();
    result = { directory, backupPath };
  } finally {
    database.close();
  }
} else {
  throw new Error(`Unsupported 9router operation: ${operation}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
