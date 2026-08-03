#!/usr/bin/env node
/**
 * Browser-level production gate built on Traycer's original CDP helpers.
 * It drives the composed OpenCodex UI and AIWrapper gateway as a real user.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:net";

const require = createRequire(import.meta.url);
const {
  applyResolutionViewport,
  captureScreenshot,
  connectCdp,
  waitForInspectablePage,
  waitForRendererReady,
} = require("../../upstream/traycer/clients/desktop/scripts/resolution/helpers.cjs");

const RUN = process.env.AIWRAPPER_E2E_UI_LIVE === "1";
const WEB = (process.env.AIWRAPPER_E2E_ORIGIN ?? "http://127.0.0.1:8765").replace(/\/$/, "");
const API = (process.env.AIWRAPPER_E2E_BASE ?? "http://127.0.0.1:8766").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.AIWRAPPER_E2E_TIMEOUT_MS ?? 120_000);
const MARKER = `AIWRAPPER_BROWSER_E2E_${Date.now()}`;
const SCREENSHOT = resolve(process.env.AIWRAPPER_E2E_UI_SCREENSHOT
  ?? "services/codex-wrapper/.aiwrapper/e2e/live-browser-smoke.png");

function fail(message) {
  throw new Error(message);
}

function readIndividualKey() {
  const inline = process.env.AIWRAPPER_E2E_KEY?.trim();
  if (inline) return inline;
  const configured = process.env.AIWRAPPER_E2E_KEY_FILE?.trim();
  const path = resolve(configured || "services/codex-wrapper/.aiwrapper/bootstrap-owner.key");
  if (!existsSync(path)) fail(`AIWrapper browser E2E key file not found: ${path}`);
  const value = readFileSync(path, "utf8").trim();
  if (!value) fail(`AIWrapper browser E2E key file is empty: ${path}`);
  return value;
}

function findChrome() {
  const configured = process.env.AIWRAPPER_E2E_CHROME_PATH?.trim();
  const candidates = [
    configured,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) fail("Chrome or Edge was not found; set AIWRAPPER_E2E_CHROME_PATH");
  return path;
}

function redact(message, secrets) {
  return secrets.reduce(
    (safe, secret) => secret ? safe.replaceAll(secret, "<redacted>") : safe,
    String(message),
  ).replace(/Bearer\s+\S+/gi, "Bearer <redacted>");
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  await new Promise((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise()));
  if (!address || typeof address === "string") fail("Unable to reserve a Chrome debugging port");
  return address.port;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails !== undefined) fail(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function waitFor(client, expression, label, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await evaluate(client, expression);
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
  }
  fail(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function click(client, selector) {
  const clicked = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement) || element.hasAttribute("disabled")) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) fail(`Unable to click ${selector}`);
}

async function setInput(client, selector, value) {
  const changed = await evaluate(client, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!changed) fail(`Unable to fill ${selector}`);
}

async function api(path, key, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) fail(`${init.method ?? "GET"} ${path} returned ${response.status}`);
  return response;
}

async function listSessions(key) {
  return (await (await api("/v1/sessions", key)).json()).data ?? [];
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolvePromise => child.once("exit", resolvePromise)),
    new Promise(resolvePromise => setTimeout(resolvePromise, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

if (!RUN) {
  process.stderr.write(
    "Refusing to drive a live browser/provider. Set AIWRAPPER_E2E_UI_LIVE=1 and provide " +
    "AIWRAPPER_E2E_KEY or AIWRAPPER_E2E_KEY_FILE.\n",
  );
  process.exit(2);
}

const individualKey = readIndividualKey();
const secrets = [individualKey];
const beforeIds = new Set((await listSessions(individualKey)).map(item => item.id));
const profileDir = await mkdtemp(join(tmpdir(), "aiwrapper-browser-e2e-"));
const port = await getFreePort();
let chrome = null;
let client = null;

try {
  chrome = spawn(findChrome(), [
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    "--headless=new",
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    "--window-size=1440,960",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const stderr = [];
  chrome.stderr.on("data", chunk => stderr.push(chunk.toString()));
  const spawnFailure = new Promise((_, reject) => chrome.once("error", reject));
  const target = await Promise.race([waitForInspectablePage(port, 30_000), spawnFailure]);
  client = await connectCdp(target.webSocketDebuggerUrl);
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__aiwrapperE2eErrors = [];
      addEventListener("error", event => window.__aiwrapperE2eErrors.push(String(event.error || event.message)));
      addEventListener("unhandledrejection", event => window.__aiwrapperE2eErrors.push(String(event.reason)));`,
  });
  await client.send("Page.navigate", { url: `${WEB}/#aiwrapper-chat` });
  await waitForRendererReady(client, 30_000);
  await applyResolutionViewport(client, { width: 1440, height: 960, scaleFactor: 1 });

  await waitFor(client, `document.querySelector('.aiw-gate input[type="password"]') !== null`, "AIWrapper login gate");
  await setInput(client, '.aiw-gate input[type="password"]', individualKey);
  await click(client, ".aiw-gate .btn-primary");
  await waitFor(
    client,
    `document.querySelector(".aiw-onboarding") !== null || document.querySelector(".aiw-chat-workspace") !== null`,
    "authenticated AIWrapper page",
  );

  if (await evaluate(client, `document.querySelector(".aiw-onboarding") !== null`)) {
    for (let step = 1; step <= 4; step += 1) {
      await waitFor(
        client,
        `document.querySelector(".aiw-onboarding__progress")?.getAttribute("aria-label")?.includes(${JSON.stringify(`Step ${step} of 4`)})`,
        `onboarding step ${step}`,
      );
      await click(client, ".aiw-onboarding__actions button:last-child");
    }
  }

  await waitFor(client, `document.querySelector(".aiw-chat-workspace") !== null`, "chat workspace");
  const navigation = await evaluate(client, `(() => ({
    chat: document.querySelector('[data-page="aiwrapper-chat"]') !== null,
    users: document.querySelector('[data-page="aiwrapper-users"]') !== null,
    providers: document.querySelector('[data-page="providers"]') !== null
  }))()`);
  if (!navigation.chat || !navigation.users || !navigation.providers) fail("Owner navigation is incomplete");

  await setInput(client, ".aiw-composer textarea", `Reply exactly ${MARKER}`);
  await click(client, '.aiw-composer button[aria-label="Send"]');
  await waitFor(
    client,
    `Array.from(document.querySelectorAll(".aiw-message--assistant .aiw-markdown")).some(node => node.textContent?.includes(${JSON.stringify(MARKER)}))`,
    "streamed assistant marker",
    TIMEOUT_MS,
  );
  await waitFor(
    client,
    `Array.from(document.querySelectorAll(".aiw-session-row strong")).some(node => node.textContent?.includes(${JSON.stringify(MARKER)}))`,
    "conversation rail persistence",
  );
  const historicalToastCount = await evaluate(client, `document.querySelectorAll("[data-sonner-toast]").length`);
  if (historicalToastCount !== 0) fail(`Fresh browser session rendered ${historicalToastCount} historical toast(s)`);

  await mkdir(dirname(SCREENSHOT), { recursive: true });
  await captureScreenshot(client, SCREENSHOT);

  await click(client, '[data-page="aiwrapper-sessions"]');
  await waitFor(
    client,
    `Array.from(document.querySelectorAll(".aiw-table-wrap tbody td:first-child")).some(node => node.textContent?.includes(${JSON.stringify(MARKER)}))`,
    "session history row",
  );
  const archiveClicked = await evaluate(client, `(() => {
    const row = Array.from(document.querySelectorAll(".aiw-table-wrap tbody tr"))
      .find(node => node.textContent?.includes(${JSON.stringify(MARKER)}));
    const button = row?.querySelector("button");
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!archiveClicked) fail("Unable to archive the browser E2E conversation");
  await waitFor(
    client,
    `!Array.from(document.querySelectorAll(".aiw-table-wrap tbody tr")).some(node => node.textContent?.includes(${JSON.stringify(MARKER)}))`,
    "session removal",
  );

  await click(client, ".page-head .aiw-identity button");
  await waitFor(client, `document.querySelector(".aiw-gate") !== null`, "disconnected login gate");
  const errors = await evaluate(client, `window.__aiwrapperE2eErrors ?? []`);
  if (errors.length > 0) fail(`Browser errors: ${JSON.stringify(errors.slice(0, 5))}`);

  process.stdout.write(`${JSON.stringify({
    verdict: "PASS",
    browser: findChrome(),
    topology: { web: WEB, gateway: API },
    screenshot: SCREENSHOT,
    checks: [
      "fresh-profile login gate",
      "Traycer onboarding flow",
      "role-aware OpenCodex navigation",
      "real streamed chat",
      "conversation rail persistence",
      "historical notification baseline suppression",
      "session history navigation",
      "archive from product UI",
      "disconnect and browser error audit",
    ],
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${redact(error instanceof Error ? error.message : error, secrets)}\n`);
  process.exitCode = 1;
} finally {
  if (client) client.close();
  await stopChild(chrome);
  await rm(profileDir, { recursive: true, force: true });
  const leaked = (await listSessions(individualKey).catch(() => []))
    .filter(item => !beforeIds.has(item.id) && String(item.title).includes(MARKER));
  for (const session of leaked) {
    await api(`/v1/sessions/${encodeURIComponent(session.id)}`, individualKey, { method: "DELETE" }).catch(() => undefined);
  }
}
