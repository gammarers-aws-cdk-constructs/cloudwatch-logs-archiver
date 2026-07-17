/**
 * Type guard for CloudWatch Logs `LimitExceededException`.
 * CreateExportTask raises this when another export is already PENDING or RUNNING
 * in the account/region (concurrent export quota is one).
 *
 * @param error - Unknown thrown value (AWS SDK exception or other).
 * @returns `true` when `error` is a non-null object whose `name` is `LimitExceededException`.
 */
export const isLimitExceededException = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false;
  }
  return (error as { name: unknown }).name === 'LimitExceededException';
};
