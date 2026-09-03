/**
 * CloudWatch metric namespace for archiver operational metrics.
 * Must match the Metric Filter on the Lambda log group.
 */
export const EXPORTED_COUNT_METRIC_NAMESPACE = 'CloudWatchLogsArchiver';

/**
 * CloudWatch metric name for the number of log groups exported in a run.
 * Must match the Metric Filter on the Lambda log group.
 */
export const EXPORTED_COUNT_METRIC_NAME = 'ExportedCount';

/**
 * JSON field on the Lambda structured `message` object that holds the export count.
 * Logged via {@link emitExportedCountMetricLog}; Metric Filter path is `$.message.exportedCount`.
 */
export const EXPORTED_COUNT_LOG_FIELD = 'exportedCount';

/**
 * JSON field on the Lambda structured `message` object that holds the function name dimension.
 * Metric Filter path is `$.message.functionName`.
 */
export const EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD = 'functionName';

/**
 * Writes a structured log object that CloudWatch Logs Metric Filters can parse
 * under Lambda JSON logging (`$.message.exportedCount`, `$.message.functionName`).
 *
 * @param exportedCount - Number of log groups successfully exported in this run.
 */
export const emitExportedCountMetricLog = (exportedCount: number): void => {
  console.log({
    exportedCount,
    functionName: process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'unknown',
  });
};
