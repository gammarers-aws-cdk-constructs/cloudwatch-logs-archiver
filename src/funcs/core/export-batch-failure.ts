import type { CompletionConfig } from '@aws/durable-execution-sdk-js';
import {
  EXPORT_FAILURE_MODE_CONTINUE,
  type ExportFailureModeValue,
} from '../../settings/consts';

/** Failed log group names listed in the error message. The full list goes to the structured log. */
const MAX_FAILED_LOG_GROUPS_IN_MESSAGE = 10;

/** Lets the durable map run every item no matter how many fail. */
const CONTINUE_COMPLETION_CONFIG: CompletionConfig = { toleratedFailurePercentage: 100 };

/**
 * Inputs for {@link getExportBatchFailureMessage}.
 */
export interface ExportBatchFailureSummary {
  /** Names of the log groups whose export failed, in run order. */
  readonly failedLogGroups: readonly string[];
  /** Number of log groups the run was asked to export. */
  readonly totalCount: number;
  /** Log groups never started because the run stopped at an earlier failure. */
  readonly notAttemptedCount: number;
}

/**
 * Whether any mapped export item failed.
 *
 * @param failureCount - Number of failed items from a durable `map` batch result.
 * @returns `true` when at least one export failed.
 */
export const hasExportBatchFailure = (failureCount: number): boolean => failureCount > 0;

/**
 * Durable map completion settings for the failure mode.
 * Without a completion config the map stops at the first failed item.
 *
 * @param failureMode - Resolved `Params.Export.FailureMode`.
 * @returns `undefined` for `FAIL_FAST`, or a config that tolerates every failure for `CONTINUE`.
 */
export const toExportCompletionConfig = (failureMode: ExportFailureModeValue): CompletionConfig | undefined => {
  if (failureMode === EXPORT_FAILURE_MODE_CONTINUE) {
    return CONTINUE_COMPLETION_CONFIG;
  }
  return undefined;
};

/**
 * Builds the error message thrown when one or more log group exports fail.
 * Lists up to ten failed log group names; longer lists end with `and N more`.
 *
 * @param summary - Failed names, total log groups, and log groups never started.
 * @returns Message such as `Export failed for 1 of 3 log group(s); 2 not attempted: group-a`.
 */
export const getExportBatchFailureMessage = (summary: ExportBatchFailureSummary): string => {
  const { failedLogGroups, totalCount, notAttemptedCount } = summary;

  const listed = failedLogGroups.slice(0, MAX_FAILED_LOG_GROUPS_IN_MESSAGE).join(', ');
  const omittedCount = failedLogGroups.length - MAX_FAILED_LOG_GROUPS_IN_MESSAGE;
  const names = omittedCount > 0 ? `${listed}, and ${omittedCount} more` : listed;

  const notAttempted = notAttemptedCount > 0 ? `; ${notAttemptedCount} not attempted` : '';
  return `Export failed for ${failedLogGroups.length} of ${totalCount} log group(s)${notAttempted}: ${names}`;
};
