import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  classifyNotificationLifecycle,
  compareAttentionOrder,
  computeLiveArrivalKeys,
  computeScrollAnchorCorrectionPx,
  findFirstVisibleAnchor,
  occurrenceKeyForNotification,
  temporalGroupForTimestamp,
} from "../../../extensions/aiwrapper-notifications/src/traycer-notification-runtime";

test("Traycer lifecycle keeps unresolved actions and unread failures in Attention", () => {
  expect(classifyNotificationLifecycle({
    source: "app-local",
    severity: "needs_action",
    readAt: null,
    resolvedAt: null,
  })).toEqual({ section: "attention", tier: "blocking" });
  expect(classifyNotificationLifecycle({
    source: "app-local",
    severity: "failure",
    readAt: null,
    resolvedAt: null,
  })).toEqual({ section: "attention", tier: "failure" });
  expect(classifyNotificationLifecycle({
    source: "app-local",
    severity: "needs_action",
    readAt: 1,
    resolvedAt: 1,
  })).toEqual({ section: "recent" });
});

test("Traycer attention ordering is blocking-first and deterministic", () => {
  const rows = [
    { tier: "failure" as const, createdAt: 20, feedId: "b" },
    { tier: "blocking" as const, createdAt: 10, feedId: "c" },
    { tier: "blocking" as const, createdAt: 10, feedId: "a" },
  ].sort(compareAttentionOrder);

  expect(rows.map((row) => row.feedId)).toEqual(["a", "c", "b"]);
});

test("Traycer occurrence and calendar grouping preserve arrival semantics", () => {
  const first = occurrenceKeyForNotification({ feedId: "audit:1", createdAt: 10, sourceRef: "one" });
  const reopened = occurrenceKeyForNotification({ feedId: "audit:1", createdAt: 10, sourceRef: "two" });
  expect(reopened).not.toBe(first);

  const now = new Date(2026, 7, 2, 12).getTime();
  expect(temporalGroupForTimestamp(new Date(2026, 7, 2, 1).getTime(), now)).toBe("today");
  expect(temporalGroupForTimestamp(new Date(2026, 7, 1, 23).getTime(), now)).toBe("yesterday");
  expect(temporalGroupForTimestamp(new Date(2026, 6, 30, 23).getTime(), now)).toBe("earlier");
});

test("Traycer live-arrival detection ignores pagination and counts recurrences", () => {
  const baseline = [
    { feedId: "audit:front", occurrenceKey: "front@100" },
    { feedId: "audit:older", occurrenceKey: "older@50" },
  ];
  expect(computeLiveArrivalKeys(baseline, [
    { feedId: "audit:new", occurrenceKey: "new@200" },
    ...baseline,
    { feedId: "audit:page", occurrenceKey: "page@10" },
  ])).toEqual(["new@200"]);
  expect(computeLiveArrivalKeys(baseline, [
    { feedId: "audit:front", occurrenceKey: "front@200" },
    baseline[1],
  ])).toEqual(["front@200"]);
});

test("Traycer scroll anchor preserves the nearest surviving row", () => {
  const metrics = new Map([
    ["audit:a", { offsetTopPx: -20, heightPx: 40 }],
    ["audit:c", { offsetTopPx: 50, heightPx: 40 }],
  ]);
  expect(findFirstVisibleAnchor(["audit:a", "audit:c"], metrics)).toEqual({
    feedId: "audit:a",
    offsetTopPx: -20,
  });
  expect(computeScrollAnchorCorrectionPx({
    previousAnchor: { feedId: "audit:b", offsetTopPx: 40 },
    previousOrderedFeedIds: ["audit:a", "audit:b", "audit:c"],
    previousScrollTop: 40,
    currentScrollTop: 40,
    currentMetrics: metrics,
  })).toBe(10);
});

test("notification center is mounted and wired to the authenticated feed", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const center = readFileSync(
    new URL("../../../extensions/aiwrapper-notifications/src/NotificationsCenter.tsx", import.meta.url),
    "utf8",
  );

  expect(app).toContain("<NotificationsCenter />");
  expect(center).toContain('client.get<NotificationResponse>("/v1/me/notifications")');
  expect(center).toContain("<Toaster");
  expect(center).toContain("toast(row.title");
  expect(center).toContain("useNotificationCenterScrollAnchor");
  expect(center).toContain("useNotificationCenterArrivals");
});
