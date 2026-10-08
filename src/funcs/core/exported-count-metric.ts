import {
  EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD,
  EXPORTED_COUNT_LOG_FIELD,
} from '../../settings/consts';

/**
 * Writes a structured log object that CloudWatch Logs Metric Filters can parse
 * under Lambda JSON logging (`$.message.exportedCount`, `$.message.functionName`).
 *
 * @param exportedCount - Number of log groups successfully exported in this run.
 */
export const emitExportedCountMetricLog = (exportedCount: number): void => {
  console.log({
    [EXPORTED_COUNT_LOG_FIELD]: exportedCount,
    [EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD]: process.env.AWS_LAMBDA_FUNCTION_NAME ?? 'unknown',
  });
};
