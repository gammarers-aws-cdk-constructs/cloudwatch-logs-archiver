/**
 * Values shared by the construct and the Lambda.
 * Validation that throws lives next to each caller; this module only holds the agreed values.
 */

/** UTC days before today that the export window ends on when `endOffsetDays` is omitted. */
export const DEFAULT_EXPORT_END_OFFSET_DAYS = 1;

/** Smallest accepted `endOffsetDays`. `1` ends the window on yesterday. */
export const MIN_EXPORT_END_OFFSET_DAYS = 1;

/** UTC calendar days exported when `spanDays` is omitted. */
export const DEFAULT_EXPORT_SPAN_DAYS = 1;

/** Smallest accepted `spanDays`. */
export const MIN_EXPORT_SPAN_DAYS = 1;

/**
 * Largest accepted `spanDays`.
 * Keeps a daily run from scheduling more CreateExportTask calls than the durable timeout can finish.
 */
export const MAX_EXPORT_SPAN_DAYS = 31;

/** `{logGroup}` token in the default destination prefix template. */
export const DESTINATION_PREFIX_LOG_GROUP_TOKEN = '{logGroup}';

/** `{yyyy}` token in the default destination prefix template. */
export const DESTINATION_PREFIX_YEAR_TOKEN = '{yyyy}';

/** `{mm}` token in the default destination prefix template. */
export const DESTINATION_PREFIX_MONTH_TOKEN = '{mm}';

/** `{dd}` token in the default destination prefix template. */
export const DESTINATION_PREFIX_DAY_TOKEN = '{dd}';

/** Tokens a destination prefix template may contain. */
export const DESTINATION_PREFIX_TOKENS = [
  DESTINATION_PREFIX_LOG_GROUP_TOKEN,
  DESTINATION_PREFIX_YEAR_TOKEN,
  DESTINATION_PREFIX_MONTH_TOKEN,
  DESTINATION_PREFIX_DAY_TOKEN,
] as const;

/**
 * Default S3 key prefix: sanitized log group, then UTC year, month, and day.
 * Example: `example-log-group/2026/07/16/`.
 */
export const DEFAULT_DESTINATION_PREFIX_TEMPLATE =
  `${DESTINATION_PREFIX_LOG_GROUP_TOKEN}/${DESTINATION_PREFIX_YEAR_TOKEN}/${DESTINATION_PREFIX_MONTH_TOKEN}/${DESTINATION_PREFIX_DAY_TOKEN}/`;

/**
 * Characters CreateExportTask accepts in `destinationPrefix`.
 * The pattern is `[-./_#A-Za-z0-9]`, matching the CloudWatch Logs API.
 */
export const DESTINATION_PREFIX_CHARACTERS = '-./_#A-Za-z0-9';

/** Maximum length of a CreateExportTask `destinationPrefix`. */
export const MAX_DESTINATION_PREFIX_LENGTH = 512;

/**
 * CloudWatch metric namespace for archiver operational metrics.
 * The construct's metric filter and the Lambda log must use this same namespace.
 */
export const EXPORTED_COUNT_METRIC_NAMESPACE = 'CloudWatchLogsArchiver';

/**
 * CloudWatch metric name for the number of log groups exported in a run.
 * The construct's metric filter and the Lambda log must use this same name.
 */
export const EXPORTED_COUNT_METRIC_NAME = 'ExportedCount';

/**
 * JSON field on the Lambda structured `message` object that holds the export count.
 * Metric Filter path is `$.message.exportedCount`.
 */
export const EXPORTED_COUNT_LOG_FIELD = 'exportedCount';

/**
 * JSON field on the Lambda structured `message` object that holds the function name dimension.
 * Metric Filter path is `$.message.functionName`.
 */
export const EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD = 'functionName';
