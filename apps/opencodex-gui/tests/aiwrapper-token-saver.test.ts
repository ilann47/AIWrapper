import { expect, test } from "bun:test";

test("the administrator dashboard exposes the persisted 9router RTK control", async () => {
  const app = await Bun.file(new URL("../src/App.tsx", import.meta.url)).text();
  const panel = await Bun.file(new URL("../../../extensions/aiwrapper-admin/src/TokenSaverPanel.tsx", import.meta.url)).text();

  expect(app).toContain("<TokenSaverPanel />");
  expect(panel).toContain('client.get<TokenSaverSettings>("/admin/token-saver")');
  expect(panel).toContain('client.send<TokenSaverSettings>("/admin/token-saver", "PATCH", patch)');
  expect(panel).toContain("environmentLocked");
  expect(panel).toContain("cavemanEnabled");
  expect(panel).toContain("ponytailEnabled");
  expect(panel).toContain("<Switch");
});
