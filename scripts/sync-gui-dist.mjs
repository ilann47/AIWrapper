#!/usr/bin/env node
/**
 * Deployment boundary for the imported OpenCodex static-file server.
 * OpenCodex resolves its GUI from upstream/opencodex/gui/dist, while AIWrapper
 * deliberately develops the fork in apps/opencodex-gui. Copy the production
 * artifacts without changing the preserved upstream server implementation.
 */
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "apps", "opencodex-gui", "dist");
const destination = resolve(root, "upstream", "opencodex", "gui", "dist");
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.log(`Synced AIWrapper GUI to ${destination}`);
