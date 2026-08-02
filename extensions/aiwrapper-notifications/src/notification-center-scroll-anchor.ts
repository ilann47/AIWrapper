import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

export const NOTIFICATION_CENTER_SCROLL_TOP_THRESHOLD_PX = 8;

const FEED_ROW_ATTRIBUTE = "notificationId";

export interface NotificationCenterScrollAnchorInput {
  readonly orderedFeedIds: ReadonlyArray<string>;
}

export interface NotificationCenterScrollAnchorResult {
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly isAtTop: boolean;
  readonly scrollToTop: () => void;
}

interface FeedRowMetrics {
  readonly offsetTopPx: number;
  readonly heightPx: number;
}

interface AnchorSnapshot {
  readonly feedId: string;
  readonly offsetTopPx: number;
}

export function collectFeedRowMetrics(
  scrollEl: HTMLElement,
): ReadonlyMap<string, FeedRowMetrics> {
  const scrollRect = scrollEl.getBoundingClientRect();
  const metrics = new Map<string, FeedRowMetrics>();
  const rows = scrollEl.querySelectorAll<HTMLElement>("[data-notification-id]");
  rows.forEach((row) => {
    const feedId = row.dataset[FEED_ROW_ATTRIBUTE];
    if (feedId === undefined) return;
    const rowRect = row.getBoundingClientRect();
    metrics.set(feedId, {
      offsetTopPx: rowRect.top - scrollRect.top,
      heightPx: rowRect.height,
    });
  });
  return metrics;
}

export function findFirstVisibleAnchor(
  orderedFeedIds: ReadonlyArray<string>,
  metrics: ReadonlyMap<string, FeedRowMetrics>,
): AnchorSnapshot | null {
  for (const feedId of orderedFeedIds) {
    const row = metrics.get(feedId);
    if (row === undefined) continue;
    if (row.offsetTopPx + row.heightPx > 0) {
      return { feedId, offsetTopPx: row.offsetTopPx };
    }
  }
  return null;
}

export function computeScrollAnchorCorrectionPx(input: {
  readonly previousAnchor: AnchorSnapshot;
  readonly previousOrderedFeedIds: ReadonlyArray<string>;
  readonly currentMetrics: ReadonlyMap<string, FeedRowMetrics>;
  readonly previousScrollTop: number;
  readonly currentScrollTop: number;
}): number | null {
  const {
    previousAnchor,
    previousOrderedFeedIds,
    currentMetrics,
    previousScrollTop,
    currentScrollTop,
  } = input;
  const scrollDeltaPx = currentScrollTop - previousScrollTop;
  const exact = currentMetrics.get(previousAnchor.feedId);
  if (exact !== undefined) {
    return exact.offsetTopPx - previousAnchor.offsetTopPx + scrollDeltaPx;
  }
  const anchorIndex = previousOrderedFeedIds.indexOf(previousAnchor.feedId);
  if (anchorIndex === -1) return null;
  for (let i = anchorIndex + 1; i < previousOrderedFeedIds.length; i += 1) {
    const successor = currentMetrics.get(previousOrderedFeedIds[i]);
    if (successor !== undefined) {
      return successor.offsetTopPx - previousAnchor.offsetTopPx + scrollDeltaPx;
    }
  }
  for (let i = anchorIndex - 1; i >= 0; i -= 1) {
    const predecessor = currentMetrics.get(previousOrderedFeedIds[i]);
    if (predecessor !== undefined) {
      return predecessor.offsetTopPx - previousAnchor.offsetTopPx + scrollDeltaPx;
    }
  }
  return null;
}

export function useNotificationCenterScrollAnchor(
  input: NotificationCenterScrollAnchorInput,
): NotificationCenterScrollAnchorResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{
    readonly anchor: AnchorSnapshot;
    readonly orderedFeedIds: ReadonlyArray<string>;
    readonly scrollTop: number;
  } | null>(null);
  const [isAtTop, setIsAtTop] = useState(true);

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl === null) return;
    const metrics = collectFeedRowMetrics(scrollEl);
    const previous = anchorRef.current;
    const currentScrollTop = scrollEl.scrollTop;
    if (
      previous !== null
      && currentScrollTop > NOTIFICATION_CENTER_SCROLL_TOP_THRESHOLD_PX
    ) {
      const correction = computeScrollAnchorCorrectionPx({
        previousAnchor: previous.anchor,
        previousOrderedFeedIds: previous.orderedFeedIds,
        currentMetrics: metrics,
        previousScrollTop: previous.scrollTop,
        currentScrollTop,
      });
      if (correction !== null && correction !== 0) {
        scrollEl.scrollTop += correction;
      }
    }
    const nextAnchor = findFirstVisibleAnchor(input.orderedFeedIds, metrics);
    anchorRef.current = nextAnchor === null
      ? null
      : {
          anchor: nextAnchor,
          orderedFeedIds: input.orderedFeedIds,
          scrollTop: currentScrollTop,
        };
  }, [input.orderedFeedIds]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (scrollEl === null) return;
    function handleScroll(): void {
      if (scrollEl === null) return;
      setIsAtTop(
        scrollEl.scrollTop <= NOTIFICATION_CENTER_SCROLL_TOP_THRESHOLD_PX,
      );
    }
    handleScroll();
    scrollEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, []);

  return { scrollRef, isAtTop, scrollToTop };
}
