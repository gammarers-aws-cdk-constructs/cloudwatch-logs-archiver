/**
 * Public API for the CloudWatch Logs Archiver CDK package.
 * Re-exports the construct and stack classes, and the public enum. Their Props stay on those class files
 * and are listed here so construct-local helpers are not part of the package entry.
 */
export {
  CloudWatchLogsArchiver,
  type CloudWatchLogsArchiverProps,
  ExportFailureMode,
  type FailureAlarmOptions,
  type LogExportOptions,
  type TargetResource,
} from './cloudwatch-logs-archiver';
export {
  CloudWatchLogsArchiveStack,
  type CloudWatchLogsArchiveStackProps,
} from './cloudwatch-logs-archive-stack';
