/** CreateExportTask status: the export finished and objects were delivered. */
export const EXPORT_TASK_STATUS_COMPLETED = 'COMPLETED';

/** CreateExportTask status: the export was cancelled. */
export const EXPORT_TASK_STATUS_CANCELLED = 'CANCELLED';

/** CreateExportTask status: cancellation has been requested. */
export const EXPORT_TASK_STATUS_PENDING_CANCEL = 'PENDING_CANCEL';

/** CreateExportTask status: the export failed. */
export const EXPORT_TASK_STATUS_FAILED = 'FAILED';

/** CreateExportTask status: the export is in progress. */
export const EXPORT_TASK_STATUS_RUNNING = 'RUNNING';

/** CreateExportTask status: the export has not started. */
export const EXPORT_TASK_STATUS_PENDING = 'PENDING';

const FINISHED_EXPORT_TASK_STATUSES = new Set<string>([
  EXPORT_TASK_STATUS_COMPLETED,
  EXPORT_TASK_STATUS_CANCELLED,
  EXPORT_TASK_STATUS_PENDING_CANCEL,
]);

/**
 * Which durable wait to use while an export task is not finished and has not failed.
 * `running` is the longer wait. Every other non-terminal status uses `pending`.
 */
export const ExportTaskWait = {
  Running: 'running',
  Pending: 'pending',
} as const;

/** Durable wait selected for the current export task status. */
export type ExportTaskWait = typeof ExportTaskWait[keyof typeof ExportTaskWait];

/**
 * Whether DescribeExportTasks reported a status that ends the wait.
 * `COMPLETED`, `CANCELLED`, and `PENDING_CANCEL` all stop the wait.
 *
 * @param status - `ExportTaskStatus.code`, or the fallback used when the API omits it.
 * @returns `true` when the handler should stop waiting and treat the export as done.
 */
export const isExportTaskFinished = (status: string): boolean =>
  FINISHED_EXPORT_TASK_STATUSES.has(status);

/**
 * Whether DescribeExportTasks reported `FAILED`.
 *
 * @param status - `ExportTaskStatus.code`, or the fallback used when the API omits it.
 * @returns `true` when the handler should stop waiting and treat the export as failed.
 */
export const isExportTaskFailed = (status: string): boolean => status === EXPORT_TASK_STATUS_FAILED;

/**
 * Whether the handler should wait and describe the export task again.
 *
 * @param status - `ExportTaskStatus.code`, or the fallback used when the API omits it.
 * @returns `true` for `RUNNING`, `PENDING`, and any unknown status.
 */
export const shouldWaitForExportTask = (status: string): boolean =>
  !isExportTaskFinished(status) && !isExportTaskFailed(status);

/**
 * Selects the wait used before the next DescribeExportTasks call.
 *
 * @param status - `ExportTaskStatus.code`, or the fallback used when the API omits it.
 * @returns `running` only for `RUNNING`. Every other status uses `pending`.
 */
export const exportTaskWait = (status: string): ExportTaskWait => {
  if (status === EXPORT_TASK_STATUS_RUNNING) {
    return ExportTaskWait.Running;
  }
  return ExportTaskWait.Pending;
};
