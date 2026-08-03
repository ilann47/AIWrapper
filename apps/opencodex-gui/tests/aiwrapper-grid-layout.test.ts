import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("fixed notification surfaces stay outside the OpenCodex application grid", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const appContent = app.slice(app.indexOf("function AppContent"), app.indexOf("export default function App"));
  const providerShell = app.slice(app.indexOf("export default function App"));

  expect(appContent).not.toContain("<NotificationsCenter />");
  expect(providerShell).toContain("<AIWrapperProvider><NotificationsCenter /><AppContent /></AIWrapperProvider>");
});
