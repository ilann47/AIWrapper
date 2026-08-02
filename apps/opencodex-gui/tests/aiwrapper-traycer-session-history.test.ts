import { expect, test } from "bun:test";
import type { SessionRecord } from "../../../extensions/aiwrapper-admin/src/client";
import { projectSessionHistory } from "../../../extensions/aiwrapper-chat/src/traycer-session-history";

function session(
  id: string,
  title: string,
  updatedAt: string,
  favorite = false,
  model = "gpt-5.6-sol",
): SessionRecord {
  return {
    id,
    title,
    model,
    status: "active",
    favorite,
    createdAt: updatedAt,
    updatedAt,
  };
}

const sessions = [
  session("one", "Architecture review", "2026-08-01T10:00:00Z"),
  session("two", "Quota dashboard", "2026-08-02T10:00:00Z", true),
  session("three", "Provider routing", "2026-07-30T10:00:00Z", false, "gemini-2.5-pro"),
];

test("Traycer history projection performs tolerant Fuse search", () => {
  const result = projectSessionHistory(sessions, {
    query: "archtecture",
    favoritesOnly: false,
    sort: "relevance",
  });

  expect(result.map((item) => item.id)).toEqual(["one"]);
});

test("Traycer history projection keeps favorites pinned across explicit sorts", () => {
  const result = projectSessionHistory(sessions, {
    query: "",
    favoritesOnly: false,
    sort: "oldest",
  });

  expect(result.map((item) => item.id)).toEqual(["two", "three", "one"]);
});

test("Traycer history projection searches model ids and filters favorites", () => {
  const modelResult = projectSessionHistory(sessions, {
    query: "gemini",
    favoritesOnly: false,
    sort: "relevance",
  });
  const favoritesResult = projectSessionHistory(sessions, {
    query: "",
    favoritesOnly: true,
    sort: "recent",
  });

  expect(modelResult.map((item) => item.id)).toEqual(["three"]);
  expect(favoritesResult.map((item) => item.id)).toEqual(["two"]);
});
