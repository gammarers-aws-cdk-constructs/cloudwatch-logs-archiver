/**
 * Base error for failures raised by the log archive Lambda.
 * Not re-exported from the package entry.
 */
export abstract class CloudWatchLogsArchiverError extends Error {
  override readonly name: string = 'CloudWatchLogsArchiverError';

  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, CloudWatchLogsArchiverError.prototype);
  }
}

/**
 * Scheduler input failed validation before any export task was created,
 * or a rendered destination prefix is not accepted by CreateExportTask.
 */
export class CloudWatchLogsArchiverValidateError extends CloudWatchLogsArchiverError {
  override readonly name: string = 'CloudWatchLogsArchiverValidateError';

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, CloudWatchLogsArchiverValidateError.prototype);
  }
}
