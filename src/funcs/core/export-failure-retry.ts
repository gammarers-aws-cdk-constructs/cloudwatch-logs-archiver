/**
 * Whether a FAILED export task is still allowed one retry.
 * A boolean is not used, so the call site shows which attempt this is.
 */
export const ExportFailureRetry = {
  First: 'first',
  Retried: 'retried',
} as const;

/** Attempt state for a FAILED export task. */
export type ExportFailureRetry = typeof ExportFailureRetry[keyof typeof ExportFailureRetry];

/**
 * Whether a FAILED export should be created again.
 *
 * @param failureRetry - `first` on the original task, `retried` after that one retry.
 * @returns `true` only for the first failure.
 */
export const shouldRetryFailedExport = (failureRetry: ExportFailureRetry): boolean =>
  failureRetry === ExportFailureRetry.First;
