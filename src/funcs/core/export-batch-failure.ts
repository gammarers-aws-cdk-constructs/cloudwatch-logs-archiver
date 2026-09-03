/**
 * Whether any mapped export item failed.
 *
 * @param failureCount - Number of failed items from a durable `map` batch result.
 * @returns `true` when at least one export failed.
 */
export const hasExportBatchFailure = (failureCount: number): boolean => failureCount > 0;

/**
 * Builds the error message thrown when one or more log group exports fail.
 *
 * @param failureCount - Number of failed export items.
 * @param totalCount - Total log groups attempted in the batch.
 * @returns Human-readable error describing the partial or total export failure.
 */
export const getExportBatchFailureMessage = (failureCount: number, totalCount: number): string =>
  `Export failed for ${failureCount} of ${totalCount} log group(s)`;
