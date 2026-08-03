import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("codex-multi-auth monitor is executed unchanged and mounted in the OpenCodex dashboard", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const panel = readFileSync(
    new URL("../../../extensions/aiwrapper-admin/src/MultiAuthMonitorPanel.tsx", import.meta.url),
    "utf8",
  );
  const bridge = readFileSync(
    new URL("../../../extensions/aiwrapper-admin/src/governance-bridge.mjs", import.meta.url),
    "utf8",
  );

  expect(app).toContain("<MultiAuthMonitorPanel />");
  expect(panel).toContain('client.get<MultiAuthMonitor>("/admin/multi-auth/monitor")');
  expect(panel).toContain("modelMatrix.available");
  expect(panel).toContain("budgetGuardCount");
  expect(panel).toContain("routingProfile");
  expect(bridge).toContain("runMonitorCommand");
  expect(bridge).toContain('runMonitorCommand(["--json"]');
});
