import Fuse, { type IFuseOptions } from "fuse.js";
import type { SessionRecord } from "../../aiwrapper-admin/src/client";

/**
 * Session-history projection adapted from Traycer's use-history-query.ts and
 * home-page.data.ts. AIWrapper sessions do not carry repository/worktree
 * facets, so the integration boundary maps the searchable fields to title and
 * model while retaining Fuse's thresholds, relevance ordering, and the stable
 * pinned-first partition (AIWrapper favorites are Traycer pins).
 */
export type SessionHistorySort =
  | "recent"
  | "oldest"
  | "title-asc"
  | "title-desc"
  | "relevance";

const LOCAL_FUSE_OPTIONS: IFuseOptions<SessionRecord> = {
  includeScore: false,
  ignoreLocation: true,
  threshold: 0.4,
  minMatchCharLength: 1,
  keys: [
    { name: "title", weight: 0.8 },
    { name: "model", weight: 0.2 },
  ],
};

export interface ProjectSessionHistoryOptions {
  readonly query: string;
  readonly favoritesOnly: boolean;
  readonly sort: SessionHistorySort;
}

export function projectSessionHistory(
  items: ReadonlyArray<SessionRecord>,
  options: ProjectSessionHistoryOptions,
): ReadonlyArray<SessionRecord> {
  const filtered = options.favoritesOnly
    ? items.filter((item) => item.favorite)
    : items;
  const query = options.query.trim();
  const searched =
    query.length === 0
      ? filtered
      : new Fuse(filtered, LOCAL_FUSE_OPTIONS)
          .search(query)
          .map((result) => result.item);
  return sortProjectedHistoryItems(searched, options.sort, query);
}

function sortProjectedHistoryItems(
  items: ReadonlyArray<SessionRecord>,
  sort: SessionHistorySort,
  query: string,
): ReadonlyArray<SessionRecord> {
  if (sort === "relevance" && query.length > 0) {
    return prioritizePinnedHistoryItems(items);
  }
  return sortHistoryItems(items, sort === "relevance" ? "recent" : sort);
}

function sortHistoryItems(
  items: ReadonlyArray<SessionRecord>,
  sort: Exclude<SessionHistorySort, "relevance">,
): ReadonlyArray<SessionRecord> {
  switch (sort) {
    case "recent":
      return items
        .slice()
        .sort(
          (left, right) =>
            comparePinnedHistoryItems(left, right) ||
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
        );
    case "oldest":
      return items
        .slice()
        .sort(
          (left, right) =>
            comparePinnedHistoryItems(left, right) ||
            Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
        );
    case "title-asc":
      return items
        .slice()
        .sort(
          (left, right) =>
            comparePinnedHistoryItems(left, right) ||
            left.title.localeCompare(right.title),
        );
    case "title-desc":
      return items
        .slice()
        .sort(
          (left, right) =>
            comparePinnedHistoryItems(left, right) ||
            right.title.localeCompare(left.title),
        );
  }
}

/** Stable pinned-first partition for relevance-ranked search results. */
function prioritizePinnedHistoryItems(
  items: ReadonlyArray<SessionRecord>,
): ReadonlyArray<SessionRecord> {
  return items
    .slice()
    .sort((left, right) => comparePinnedHistoryItems(left, right));
}

function comparePinnedHistoryItems(
  left: SessionRecord,
  right: SessionRecord,
): number {
  if (Boolean(left.favorite) === Boolean(right.favorite)) return 0;
  return left.favorite ? -1 : 1;
}
