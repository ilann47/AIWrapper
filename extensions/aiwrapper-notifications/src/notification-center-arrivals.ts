import { useCallback, useMemo, useState } from "react";

export interface NotificationOccurrenceEntry {
  readonly feedId: string;
  readonly occurrenceKey: string;
}

export interface NotificationCenterArrivalsInput {
  /** Within the 8px top threshold - shares the exact flag the scroll-anchor
   * hook computes so both mechanisms agree on "at top". */
  readonly isAtTop: boolean;
  /** Full, unfiltered, newest-first occurrence order - the identity source
   * arrivals are detected against, independent of the active Recent filter. */
  readonly fullOrder: ReadonlyArray<NotificationOccurrenceEntry>;
  /** Occurrence keys for what the current projection actually renders
   * (Attention, unfiltered, plus the filtered Recent projection) - the
   * arrival set is intersected against this to get the displayed count. */
  readonly visibleOccurrenceKeys: ReadonlyArray<string>;
}

export interface NotificationCenterArrivalsResult {
  readonly newCount: number;
  /** Clears the baseline - pair with the scroll-anchor's `scrollToTop()` at
   * the call site for the sticky affordance's click handler. */
  readonly reveal: () => void;
}

/**
 * Live arrivals in `currentEntries` relative to `previousEntries`, split by
 * two independent rules:
 *
 * - A `feedId` present in both with a CHANGED `occurrenceKey` is a genuine
 *   recurrence and always counts, regardless of position.
 * - A brand-new `feedId` counts only if it sorts ahead of wherever the
 *   previous front `feedId` now sits, so appended older pages never count.
 */
export function computeLiveArrivalKeys(
  previousEntries: ReadonlyArray<NotificationOccurrenceEntry>,
  currentEntries: ReadonlyArray<NotificationOccurrenceEntry>,
): ReadonlyArray<string> {
  if (previousEntries.length === 0) return [];
  const previousOccurrenceKeyByFeedId = new Map(
    previousEntries.map((entry) => [entry.feedId, entry.occurrenceKey]),
  );
  const previousFrontFeedId = previousEntries[0].feedId;
  const previousFrontIndexNow = currentEntries.findIndex(
    (entry) => entry.feedId === previousFrontFeedId,
  );

  const arrivals: string[] = [];
  currentEntries.forEach((entry, index) => {
    const priorOccurrenceKey = previousOccurrenceKeyByFeedId.get(entry.feedId);
    if (priorOccurrenceKey === entry.occurrenceKey) return;
    if (priorOccurrenceKey !== undefined) {
      arrivals.push(entry.occurrenceKey);
      return;
    }
    if (previousFrontIndexNow !== -1 && index < previousFrontIndexNow) {
      arrivals.push(entry.occurrenceKey);
    }
  });
  return arrivals;
}

export function useNotificationCenterArrivals(
  input: NotificationCenterArrivalsInput,
): NotificationCenterArrivalsResult {
  const [previousEntries, setPreviousEntries] =
    useState<ReadonlyArray<NotificationOccurrenceEntry> | null>(null);
  const [arrivalSet, setArrivalSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  if (previousEntries !== input.fullOrder) {
    setPreviousEntries(input.fullOrder);
    if (!input.isAtTop && previousEntries !== null) {
      const liveArrivalKeys = computeLiveArrivalKeys(
        previousEntries,
        input.fullOrder,
      );
      if (liveArrivalKeys.length > 0) {
        setArrivalSet((prev) => {
          const next = new Set(prev);
          liveArrivalKeys.forEach((key) => next.add(key));
          return next;
        });
      }
    }
  }
  if (input.isAtTop && arrivalSet.size > 0) {
    setArrivalSet(new Set());
  }

  const visibleKeySet = useMemo(
    () => new Set(input.visibleOccurrenceKeys),
    [input.visibleOccurrenceKeys],
  );
  const newCount = useMemo(() => {
    let count = 0;
    arrivalSet.forEach((key) => {
      if (visibleKeySet.has(key)) count += 1;
    });
    return count;
  }, [arrivalSet, visibleKeySet]);

  const reveal = useCallback(() => {
    setArrivalSet((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return { newCount, reveal };
}
