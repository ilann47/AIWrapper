import { useEffect, useMemo, useRef } from "react";
import { Bell, Check, CheckCheck, CircleAlert, Info, ListFilter, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useKeyedClientResource } from "../../../apps/opencodex-gui/src/client-resource";
import { useT } from "../../../apps/opencodex-gui/src/i18n/shared";
import { useAIWrapper } from "../../aiwrapper-admin/src/auth";
import {
  classifyNotificationLifecycle,
  ALL_NOTIFICATION_CATEGORIES,
  categoryForNotificationSource,
  compareAttentionOrder,
  occurrenceKeyForNotification,
  temporalGroupForTimestamp,
  useNotificationCenterArrivals,
  useNotificationCenterScrollAnchor,
  useNotificationsPopoverStore,
  type NotificationCategory,
  type NotificationAttentionTier,
  type NotificationTemporalGroup,
} from "./traycer-notification-runtime";
import "./styles.css";

type Severity = "info" | "needs_action" | "failure" | "done";

interface NotificationRecord {
  feedId: string;
  source: "host" | "cloud" | "app-local" | "global";
  sourceRef: string | null;
  severity: Severity;
  eventType: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
}

interface NotificationResponse {
  data: NotificationRecord[];
  unreadCount: number;
}

interface ProjectedNotification extends NotificationRecord {
  createdAtMs: number;
  readAtMs: number | null;
  resolvedAtMs: number | null;
}

const GROUP_ORDER: NotificationTemporalGroup[] = ["today", "yesterday", "earlier"];
const CATEGORY_LABEL: Record<NotificationCategory,
  "aiw.notifications.category.task" | "aiw.notifications.category.collaboration" | "aiw.notifications.category.system"
> = {
  task: "aiw.notifications.category.task",
  collaboration: "aiw.notifications.category.collaboration",
  system: "aiw.notifications.category.system",
};
const GROUP_LABEL: Record<NotificationTemporalGroup,
  "aiw.notifications.today" | "aiw.notifications.yesterday" | "aiw.notifications.earlier"
> = {
  today: "aiw.notifications.today",
  yesterday: "aiw.notifications.yesterday",
  earlier: "aiw.notifications.earlier",
};

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function project(row: NotificationRecord): ProjectedNotification {
  return {
    ...row,
    createdAtMs: timestamp(row.createdAt) ?? 0,
    readAtMs: timestamp(row.readAt),
    resolvedAtMs: timestamp(row.resolvedAt),
  };
}

function lifecycle(row: ProjectedNotification) {
  return classifyNotificationLifecycle({
    source: row.source,
    severity: row.severity,
    readAt: row.readAtMs,
    resolvedAt: row.resolvedAtMs,
  });
}

function NotificationIcon({ severity }: { severity: Severity }) {
  if (severity === "needs_action" || severity === "failure") return <CircleAlert aria-hidden />;
  if (severity === "done") return <Check aria-hidden />;
  return <Info aria-hidden />;
}

export default function NotificationsCenter() {
  const { client, principal } = useAIWrapper();
  const t = useT();
  const open = useNotificationsPopoverStore((state) => state.open);
  const setOpen = useNotificationsPopoverStore((state) => state.setOpen);
  const unreadOnly = useNotificationsPopoverStore((state) => state.unreadOnly);
  const categories = useNotificationsPopoverStore((state) => state.categories);
  const setUnreadOnly = useNotificationsPopoverStore((state) => state.setUnreadOnly);
  const toggleCategory = useNotificationsPopoverStore((state) => state.toggleCategory);
  const resetFilters = useNotificationsPopoverStore((state) => state.resetFilters);
  const seenOccurrences = useRef<Set<string> | null>(null);
  const resource = useKeyedClientResource<NotificationResponse>(
    `aiwrapper-notifications:${principal?.userId ?? "anonymous"}`,
    [client, principal?.userId],
    async () => {
      if (!client) return { data: [], unreadCount: 0 };
      return client.get<NotificationResponse>("/v1/me/notifications");
    },
    { enabled: Boolean(client), pollMs: 10_000 },
  );

  const rows = useMemo(() => (resource.data?.data ?? []).map(project), [resource.data?.data]);
  const attention = useMemo(() => rows
    .flatMap(row => {
      const classification = lifecycle(row);
      return classification.section === "attention" ? [{ row, tier: classification.tier }] : [];
    })
    .sort((left, right) => compareAttentionOrder({
      tier: left.tier,
      createdAt: left.row.createdAtMs,
      feedId: left.row.feedId,
    }, {
      tier: right.tier,
      createdAt: right.row.createdAtMs,
      feedId: right.row.feedId,
    })), [rows]);
  const recentGroups = useMemo(() => {
    const now = Date.now();
    const groups = new Map<NotificationTemporalGroup, ProjectedNotification[]>();
    for (const row of rows) {
      if (lifecycle(row).section !== "recent") continue;
      if (unreadOnly && row.readAtMs !== null) continue;
      if (!categories.has(categoryForNotificationSource(row.source))) continue;
      const group = temporalGroupForTimestamp(row.createdAtMs, now);
      groups.set(group, [...(groups.get(group) ?? []), row]);
    }
    return groups;
  }, [categories, rows, unreadOnly]);
  const orderedFeedIds = useMemo(() => [
    ...attention.map((item) => item.row.feedId),
    ...GROUP_ORDER.flatMap((group) => (recentGroups.get(group) ?? []).map((row) => row.feedId)),
  ], [attention, recentGroups]);
  const occurrenceOrder = useMemo(() => rows.map((row) => ({
    feedId: row.feedId,
    occurrenceKey: occurrenceKeyForNotification({
      feedId: row.feedId,
      createdAt: row.createdAtMs,
      sourceRef: row.sourceRef,
    }),
  })), [rows]);
  const occurrenceKeyByFeedId = useMemo(
    () => new Map(occurrenceOrder.map((entry) => [entry.feedId, entry.occurrenceKey])),
    [occurrenceOrder],
  );
  const visibleOccurrenceKeys = useMemo(() => orderedFeedIds
    .map((feedId) => occurrenceKeyByFeedId.get(feedId))
    .filter((key): key is string => key !== undefined), [occurrenceKeyByFeedId, orderedFeedIds]);
  const { scrollRef, isAtTop, scrollToTop } = useNotificationCenterScrollAnchor({ orderedFeedIds });
  const { newCount, reveal } = useNotificationCenterArrivals({
    isAtTop,
    fullOrder: occurrenceOrder,
    visibleOccurrenceKeys,
  });

  useEffect(() => {
    const next = new Set(rows.map(row => occurrenceKeyForNotification({
      feedId: row.feedId,
      createdAt: row.createdAtMs,
      sourceRef: row.sourceRef,
    })));
    const previous = seenOccurrences.current;
    seenOccurrences.current = next;
    if (previous === null) return;
    for (const row of rows) {
      const key = occurrenceKeyForNotification({
        feedId: row.feedId,
        createdAt: row.createdAtMs,
        sourceRef: row.sourceRef,
      });
      if (!previous.has(key) && row.readAtMs === null) {
        toast(row.title, { description: row.body, id: row.feedId });
      }
    }
  }, [rows]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!client) return null;

  const update = async (ids: string[], action: "read" | "resolve" | "clear") => {
    if (ids.length === 0) return;
    await client.send("/v1/me/notifications", "PATCH", { ids, action });
    resource.refresh();
  };
  const unread = resource.data?.unreadCount ?? 0;
  const isFiltered = unreadOnly || categories.size < ALL_NOTIFICATION_CATEGORIES.size;

  const renderRow = (row: ProjectedNotification, tier?: NotificationAttentionTier) => (
    <article data-notification-id={row.feedId} className={`aiw-notification-row aiw-notification-row--${row.severity}`} key={row.feedId}>
      <span className="aiw-notification-row__icon"><NotificationIcon severity={row.severity} /></span>
      <div className="aiw-notification-row__copy">
        <strong>{row.title}</strong>
        <p>{row.body}</p>
        <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time>
      </div>
      <div className="aiw-notification-row__actions">
        {tier === "blocking" ? (
          <button type="button" className="btn btn-sm" onClick={() => void update([row.feedId], "resolve")}>{t("aiw.notifications.resolve")}</button>
        ) : row.readAtMs === null ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void update([row.feedId], "read")} aria-label={t("aiw.notifications.markRead")}><Check /></button>
        ) : null}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void update([row.feedId], "clear")} aria-label={t("aiw.notifications.clear")}><X /></button>
      </div>
    </article>
  );

  return (
    <>
      <Toaster position="top-right" richColors closeButton />
      <div className="aiw-notifications">
        <button type="button" className="aiw-notifications__bell" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="aiw-notification-center" aria-label={t("aiw.notifications.open")}>
          <Bell aria-hidden />
          {unread > 0 ? <span>{unread > 99 ? "99+" : unread}</span> : null}
        </button>
        {open ? <section id="aiw-notification-center" className="aiw-notifications__panel" aria-labelledby="aiw-notifications-title">
          <header>
            <div><h2 id="aiw-notifications-title">{t("aiw.notifications.title")}</h2><p>{t("aiw.notifications.subtitle")}</p></div>
            <div>
              <details className="aiw-notifications__filters">
                <summary aria-label={t("aiw.notifications.filter")} title={t("aiw.notifications.filter")}>
                  <ListFilter aria-hidden />
                  {isFiltered ? <span aria-hidden /> : null}
                </summary>
                <div role="group" aria-label={t("aiw.notifications.filter")}>
                  <label><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /> {t("aiw.notifications.unreadOnly")}</label>
                  <strong>{t("aiw.notifications.categories")}</strong>
                  {[...ALL_NOTIFICATION_CATEGORIES].map((category) => (
                    <label key={category}><input type="checkbox" checked={categories.has(category)} onChange={() => toggleCategory(category)} /> {t(CATEGORY_LABEL[category])}</label>
                  ))}
                  {isFiltered ? <button type="button" className="btn btn-sm btn-ghost" onClick={resetFilters}>{t("aiw.notifications.resetFilters")}</button> : null}
                </div>
              </details>
              <button type="button" className="btn btn-sm btn-ghost" disabled={unread === 0} onClick={() => void update(rows.filter(row => row.readAtMs === null).map(row => row.feedId), "read")}><CheckCheck /> {t("aiw.notifications.markAllRead")}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)} aria-label={t("common.close")}><X /></button>
            </div>
          </header>
          <div ref={scrollRef} className="aiw-notifications__feed">
            {newCount > 0 ? (
              <button type="button" className="aiw-notifications__new" onClick={() => { reveal(); scrollToTop(); }}>
                {t("aiw.notifications.newArrivals", { count: String(newCount) })}
              </button>
            ) : null}
            {resource.error ? <div className="notice notice-err" role="alert">{String(resource.error)}</div> : null}
            {attention.length > 0 ? <section><h3>{t("aiw.notifications.attention")}</h3>{attention.map(item => renderRow(item.row, item.tier))}</section> : null}
            {GROUP_ORDER.map(group => {
              const groupRows = recentGroups.get(group) ?? [];
              if (groupRows.length === 0) return null;
              return <section key={group}><h3>{t(GROUP_LABEL[group])}</h3>{groupRows.map(row => renderRow(row))}</section>;
            })}
            {isFiltered && attention.length === 0 && [...recentGroups.values()].every((groupRows) => groupRows.length === 0) ? (
              <div className="aiw-notifications__empty"><p>{t("aiw.notifications.filterEmpty")}</p><button type="button" className="btn btn-sm" onClick={resetFilters}>{t("aiw.notifications.resetFilters")}</button></div>
            ) : null}
            {!resource.loading && rows.length === 0 ? <p className="aiw-notifications__empty">{t("aiw.notifications.empty")}</p> : null}
          </div>
        </section> : null}
      </div>
    </>
  );
}
