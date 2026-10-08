/** Milliseconds in one UTC calendar day. */
const MS_PER_UTC_DAY = 24 * 60 * 60 * 1000;

/**
 * One UTC calendar day to pass to CreateExportTask, plus the date segments for the S3 prefix.
 */
export interface UtcDayWindow {
  /** Epoch ms of that UTC day at 00:00:00.000. */
  readonly from: number;
  /** Epoch ms of that UTC day at 23:59:59.999. */
  readonly to: number;
  /** Four-digit UTC year. */
  readonly year: string;
  /** Two-digit UTC month. */
  readonly month: string;
  /** Two-digit UTC day. */
  readonly day: string;
}

/**
 * How far back from today the export window reaches.
 */
export interface UtcExportWindowSpec {
  /** UTC calendar days before today that the window ends on. */
  readonly endOffsetDays: number;
  /** Number of UTC calendar days in the window, ending on that day. */
  readonly spanDays: number;
}

/**
 * Builds the from/to epoch range and zero-padded UTC date segments for one day.
 *
 * @param from - Epoch ms of that UTC day at 00:00:00.000.
 * @returns The day's export window.
 */
const toUtcDayWindow = (from: number): UtcDayWindow => {
  const to = from + MS_PER_UTC_DAY - 1;
  const target = new Date(from);
  return {
    from,
    to,
    year: String(target.getUTCFullYear()),
    month: ('00' + (target.getUTCMonth() + 1)).slice(-2),
    day: ('00' + target.getUTCDate()).slice(-2),
  };
};

/**
 * Lists UTC calendar days to export, oldest first.
 * The last day is `endOffsetDays` before today's UTC date. `spanDays` counts backward from that day.
 * Uses `Date.UTC` so the result does not depend on the runtime local timezone.
 *
 * @param now - Reference instant (typically `new Date()` at invocation time).
 * @param spec - End offset and length of the window. Callers validate these before use.
 * @returns One window per day, oldest first. Empty when `spanDays` is 0.
 */
export const listUtcExportWindows = (now: Date, spec: UtcExportWindowSpec): readonly UtcDayWindow[] => {
  const endFrom = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - spec.endOffsetDays,
  );
  const windows: UtcDayWindow[] = [];

  for (let daysBeforeEnd = spec.spanDays - 1; daysBeforeEnd >= 0; daysBeforeEnd -= 1) {
    windows.push(toUtcDayWindow(endFrom - daysBeforeEnd * MS_PER_UTC_DAY));
  }

  return windows;
};
