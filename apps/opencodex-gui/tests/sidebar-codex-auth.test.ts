import { expect, test } from "bun:test";
import { useHeaderSearchStore } from "../../../extensions/aiwrapper-admin/src/header-search-store";

/**
 * Superseded by WP2a (devlog/_plan/260725_gui_view_consolidation/020_nav_and_dashboard_tabs.md).
 *
 * Codex Auth used to be filtered out of the sidebar in Workspace mode, on the
 * reasoning that the Providers workspace embeds the same account pool. The
 * maintainer instead promoted it to the second slot so it is always reachable.
 * That old filter was also a latent WP5 hazard: once Classic is removed there is
 * no non-workspace mode left, so a viewMode-keyed filter would have hidden the
 * page permanently.
 */

test("Codex Auth is always present in the sidebar, never filtered by view mode", async () => {
  const src = await Bun.file(new URL("../src/App.tsx", import.meta.url)).text();

  // The old conditional filter must not come back.
  expect(src).not.toContain('viewMode === "workspace" && id === "codex-auth"');
  expect(src).toMatch(/NAV_GROUPS\s*\.filter\(group => !group\.adminOnly \|\| isAdministrator\)/);

  // It stays in the nav table and remains routable for deep links.
  expect(src).toContain('{ id: "codex-auth", tkey: "nav.codexAuth", Icon: IconKey }');
  expect(src).toContain('{page === "codex-auth" && <CodexAuth apiBase={API_BASE} />}');
});

test("9router header search state filters the consolidated navigation and resets cleanly", async () => {
  const src = await Bun.file(new URL("../src/App.tsx", import.meta.url)).text();
  const search = await Bun.file(new URL("../../../extensions/aiwrapper-admin/src/NavigationSearch.tsx", import.meta.url)).text();

  useHeaderSearchStore.getState().register("Find a page");
  useHeaderSearchStore.getState().setQuery("models");
  expect(useHeaderSearchStore.getState()).toMatchObject({ visible: true, placeholder: "Find a page", query: "models" });
  expect(src).toContain("visibleNavGroups.map");
  expect(src).toContain("t(item.tkey).toLocaleLowerCase().includes(query)");
  expect(src).toContain('window.matchMedia("(max-width: 760px)").matches');
  expect(search).toContain('event.key.toLocaleLowerCase() === "k"');
  expect(search).toContain("requestAnimationFrame");

  useHeaderSearchStore.getState().unregister();
  expect(useHeaderSearchStore.getState()).toMatchObject({ visible: false, placeholder: "", query: "" });
});
