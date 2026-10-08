import {
  exportTaskWait,
  ExportTaskWait,
  isExportTaskFailed,
  isExportTaskFinished,
  shouldWaitForExportTask,
} from '../../src/funcs/core/export-task-status';

describe('export task status', () => {
  it.each([
    {
      name: 'completed',
      status: 'COMPLETED',
      finished: true,
      failed: false,
      shouldWait: false,
      wait: ExportTaskWait.Pending,
    },
    {
      name: 'cancelled',
      status: 'CANCELLED',
      finished: true,
      failed: false,
      shouldWait: false,
      wait: ExportTaskWait.Pending,
    },
    {
      name: 'pending cancel',
      status: 'PENDING_CANCEL',
      finished: true,
      failed: false,
      shouldWait: false,
      wait: ExportTaskWait.Pending,
    },
    {
      name: 'failed',
      status: 'FAILED',
      finished: false,
      failed: true,
      shouldWait: false,
      wait: ExportTaskWait.Pending,
    },
    {
      name: 'running',
      status: 'RUNNING',
      finished: false,
      failed: false,
      shouldWait: true,
      wait: ExportTaskWait.Running,
    },
    {
      name: 'pending',
      status: 'PENDING',
      finished: false,
      failed: false,
      shouldWait: true,
      wait: ExportTaskWait.Pending,
    },
    {
      name: 'unknown status',
      status: 'UNKNOWN',
      finished: false,
      failed: false,
      shouldWait: true,
      wait: ExportTaskWait.Pending,
    },
  ])('$name', ({ status, finished, failed, shouldWait, wait }) => {
    expect(isExportTaskFinished(status)).toBe(finished);
    expect(isExportTaskFailed(status)).toBe(failed);
    expect(shouldWaitForExportTask(status)).toBe(shouldWait);
    expect(exportTaskWait(status)).toBe(wait);
  });
});
