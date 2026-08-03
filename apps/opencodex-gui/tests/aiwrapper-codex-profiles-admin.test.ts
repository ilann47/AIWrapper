import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("Codex profile diagnostics are exposed as an administrator page", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const routing = readFileSync(new URL("../src/app-routing.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../../extensions/aiwrapper-users/src/ProfilesPage.tsx", import.meta.url), "utf8");
  expect(app).toContain('id: "aiwrapper-profiles"');
  expect(app).toContain("<ProfilesPage />");
  expect(routing).toContain('"aiwrapper-profiles"');
  expect(page).toContain('client.get<ProfileDiagnostics>("/admin/profiles")');
  expect(page).toContain("commandExitCode");
  expect(page).toContain("data.desktop.path");
  expect(page).toContain("data.desktop.app_path");
  expect(page).toContain("data.desktop.scope");
  expect(page).toContain("data.desktop.account_identity");
  expect(page).toContain("data.legacy_clone_root.found");
  expect(page).toContain("data.workspaces.registry_path");
  expect(page).toContain("data.workspaces.config_home");
  expect(page).toContain('className="aiw-stack aiw-profile-page"');
  expect(page).toContain('className="tbl-wrap"');
  expect(page).not.toContain('className="aiw-table-wrap"');
});

test("creating a user no longer asks for a CODEX_HOME that the backend ignores", () => {
  const page = readFileSync(new URL("../../../extensions/aiwrapper-users/src/UsersPage.tsx", import.meta.url), "utf8");
  expect(page).toContain('t("aiw.users.profileAutomatic")');
  expect(page).not.toContain("setCodexHome");
  expect(page).not.toContain("{ name, role, codexHome }");
});
