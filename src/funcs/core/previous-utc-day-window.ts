import { listUtcExportWindows } from './export-window';
import { DEFAULT_EXPORT_END_OFFSET_DAYS, DEFAULT_EXPORT_SPAN_DAYS } from '../../settings/consts';

/**
 * Export window and S3 path date segments for the previous UTC calendar day.
 */
export interface PreviousUtcDayWindow {
  /** Epoch ms of previous UTC day 00:00:00.000. */
  readonly from: number;
  /** Epoch ms of previous UTC day 23:59:59.999. */
  readonly to: number;
  /** Four-digit UTC year for S3 prefix. */
  readonly year: string;
  /** Two-digit UTC month for S3 prefix. */
  readonly month: string;
  /** Two-digit UTC day for S3 prefix. */
  readonly day: string;
}

/**
 * Computes the previous UTC calendar day's export window and YYYY/MM/DD segments.
 * Uses `Date.UTC` / UTC getters so results do not depend on the runtime local timezone.
 *
 * @param now - Reference instant (typically `new Date()` at invocation time).
 * @returns from/to epoch milliseconds and zero-padded date path segments.
 * @throws Error when the default one-day window is empty.
 */
export const getPreviousUtcDayWindow = (now: Date): PreviousUtcDayWindow => {
  const [window] = listUtcExportWindows(now, {
    endOffsetDays: DEFAULT_EXPORT_END_OFFSET_DAYS,
    spanDays: DEFAULT_EXPORT_SPAN_DAYS,
  });
  if (window === undefined) {
    throw new Error('Expected the previous UTC day window.');
  }
  return window;
};
