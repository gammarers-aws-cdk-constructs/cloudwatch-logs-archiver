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
 */
export const getPreviousUtcDayWindow = (now: Date): PreviousUtcDayWindow => {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
  const to = from + (1000 * 60 * 60 * 24) - 1;
  const target = new Date(from);
  return {
    from,
    to,
    year: String(target.getUTCFullYear()),
    month: ('00' + (target.getUTCMonth() + 1)).slice(-2),
    day: ('00' + target.getUTCDate()).slice(-2),
  };
};
