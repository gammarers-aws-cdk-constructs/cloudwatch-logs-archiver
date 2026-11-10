import {
  type DurableContext,
  withDurableExecution,
} from '@aws/durable-execution-sdk-js';
import {
  CloudWatchLogsClient,
  CreateExportTaskCommand,
  DescribeExportTasksCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import {
  GetResourcesCommand,
  ResourceGroupsTaggingAPIClient,
} from '@aws-sdk/client-resource-groups-tagging-api';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { StrictEnvResolver, StrictEnvType } from 'strict-env-resolver';
import { EXPORT_FAILURE_LOG_MESSAGE } from '../settings/consts';
import { buildDestinationPrefix } from './core/destination-prefix';
import {
  getExportBatchFailureMessage,
  hasExportBatchFailure,
  toExportCompletionConfig,
} from './core/export-batch-failure';
import { ExportFailureRetry, shouldRetryFailedExport } from './core/export-failure-retry';
import {
  EXPORT_TASK_STATUS_PENDING,
  exportTaskWait,
  ExportTaskWait,
  isExportTaskFinished,
  shouldWaitForExportTask,
} from './core/export-task-status';
import { listUtcExportWindows, type UtcDayWindow } from './core/export-window';
import { emitExportedCountMetricLog } from './core/exported-count-metric';
import { isLimitExceededException } from './core/is-limit-exceeded-exception';
import { resolveExportSettings } from './core/resolve-export-settings';
import { hasNextResourceTagPage } from './core/resource-tag-page';

/**
 * EventBridge Scheduler target input for the log archive Lambda.
 */
interface ScheduleEvent {
  /** Tag filter parameters passed from the scheduler target input. */
  Params: {
    /** Tag key used to discover CloudWatch Log groups. */
    TagKey: string;
    /** Tag values to match; groups with any of these values are exported. */
    TagValues: string[];
    /**
     * Optional export window, prefix, and failure mode. Omitted fields use the Lambda defaults
     * (previous UTC day, one day, `{logGroup}/{yyyy}/{mm}/{dd}/`, `FAIL_FAST`).
     */
    Export?: unknown;
  };
}

/**
 * One CreateExportTask call: time range and rendered S3 prefix.
 */
interface ExportTaskTarget {
  /** Epoch ms passed to CreateExportTask `from`. */
  readonly from: number;
  /** Epoch ms passed to CreateExportTask `to`. */
  readonly to: number;
  /** Rendered destination prefix. */
  readonly destinationPrefix: string;
}

/**
 * Extracts the log group name from a CloudWatch Logs resource ARN.
 * Uses the same convention as Step Functions: split by ':', take index 6.
 * @param arn - The resource ARN (e.g. arn:aws:logs:region:account:log-group:name).
 * @returns The log group name, or the original arn if parsing fails.
 */
const getLogGroupNameFromArn = (arn: string): string => {
  const parts = arn.split(':');
  return parts[6] ?? arn;
};

/** Dimension value when the Lambda runtime did not set a function name. */
const UNKNOWN_LAMBDA_FUNCTION_NAME = 'unknown';

/**
 * Reads the Lambda function name. A missing or blank value becomes {@link UNKNOWN_LAMBDA_FUNCTION_NAME}.
 */
const resolveLambdaFunctionName = (): string => StrictEnvResolver.resolve(
  'AWS_LAMBDA_FUNCTION_NAME',
  StrictEnvType.String,
  { default: UNKNOWN_LAMBDA_FUNCTION_NAME, trim: true },
);

/** Total tries per SDK send, including the first. Matches the SDK default. */
const AWS_SDK_MAX_ATTEMPTS = 3;

/** TCP connect limit for one SDK HTTP call. */
const AWS_SDK_CONNECTION_TIMEOUT_MS = 5_000;

/** Response limit for one SDK HTTP call, before the SDK retries. */
const AWS_SDK_REQUEST_TIMEOUT_MS = 30_000;

/**
 * SDK retry and per-request timeouts. The region comes from the Lambda environment.
 * Overall export waiting stays on durable wait, not on these HTTP limits.
 */
const createAwsClientConfig = () => ({
  maxAttempts: AWS_SDK_MAX_ATTEMPTS,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: AWS_SDK_CONNECTION_TIMEOUT_MS,
    requestTimeout: AWS_SDK_REQUEST_TIMEOUT_MS,
  }),
});

/** Seconds to wait between status checks when the export task is RUNNING. */
const RUNNING_WAIT_SECONDS = 10;

/** Seconds to wait when status is PENDING or before retrying a FAILED export. */
const PENDING_WAIT_SECONDS = 3;

/**
 * Durable wait step suffix and duration for each {@link ExportTaskWait}.
 * Suffixes stay `running-wait` and `pending-wait` so checkpoint names do not change.
 */
const EXPORT_TASK_WAITS = {
  [ExportTaskWait.Running]: { stepSuffix: 'running-wait', seconds: RUNNING_WAIT_SECONDS },
  [ExportTaskWait.Pending]: { stepSuffix: 'pending-wait', seconds: PENDING_WAIT_SECONDS },
} as const;

/**
 * Seconds to wait before retrying CreateExportTask after LimitExceededException
 * (another PENDING/RUNNING export occupies the account/region slot).
 */
const LIMIT_EXCEEDED_WAIT_SECONDS = 30;

/**
 * Outcome of a durable CreateExportTask step.
 * `limit_exceeded` is returned as a value (not thrown) so the step can checkpoint,
 * then the caller waits and retries with a new step name.
 */
type CreateExportTaskStepResult =
  | {
    /** CreateExportTask succeeded and returned a task ID. */
    readonly kind: 'created';
    /** Export task ID from CreateExportTask. */
    readonly taskId: string;
  }
  | {
    /** Concurrent export quota exceeded; wait then retry CreateExportTask. */
    readonly kind: 'limit_exceeded';
    /** Exception message (or fallback) for structured logging. */
    readonly reason: string;
  };

/**
 * Whether CreateExportTask should wait for an export slot and retry.
 * Also narrows `result` to the `limit_exceeded` variant.
 *
 * @param result - Outcome of a CreateExportTask durable step.
 * @returns `true` when `result.kind` is `limit_exceeded`.
 */
const shouldRetryCreateExportAfterLimitExceeded = (
  result: CreateExportTaskStepResult,
): result is { readonly kind: 'limit_exceeded'; readonly reason: string } =>
  result.kind === 'limit_exceeded';

/**
 * Builds a loggable failure reason from an unknown thrown value.
 *
 * @param error - Thrown value (typically LimitExceededException).
 * @returns Non-empty `Error.message`, or `"LimitExceededException"` when missing.
 */
const getErrorReason = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'LimitExceededException';
};

/**
 * Creates a CloudWatch Logs export task for one log group and one UTC day, then waits until it completes.
 * Retries CreateExportTask after Durable wait on LimitExceededException; retries once on FAILED.
 *
 * @param ctx - Durable execution context for steps and waits.
 * @param stepName - Base name for step IDs (e.g. `"export-0-day-0"`).
 * @param cwLogs - CloudWatch Logs client.
 * @param bucketName - S3 bucket destination for the export.
 * @param logGroupName - Name of the log group to export.
 * @param target - Time range and destination prefix for this day.
 * @param failureRetry - `first` on the original task, `retried` after one FAILED retry.
 * @returns Resolves when the export task reaches COMPLETED, CANCELLED, or PENDING_CANCEL.
 * @throws Error if CreateExportTask omits `taskId`, a non-LimitExceeded SDK error occurs,
 *   or the task is FAILED after one retry.
 */
const createExportLogGroup = async (
  ctx: DurableContext,
  stepName: string,
  cwLogs: CloudWatchLogsClient,
  bucketName: string,
  logGroupName: string,
  target: ExportTaskTarget,
  failureRetry: ExportFailureRetry,
): Promise<void> => {
  let createAttempt = 0;
  let createResult: CreateExportTaskStepResult;

  do {
    createResult = await ctx.step(`${stepName}-create-${createAttempt}`, async (): Promise<CreateExportTaskStepResult> => {
      try {
        const result = await cwLogs.send(new CreateExportTaskCommand({
          destination: bucketName,
          logGroupName,
          from: target.from,
          to: target.to,
          destinationPrefix: target.destinationPrefix,
        }));
        if (!result.taskId) {
          throw new Error(`CreateExportTask did not return taskId for log group: ${logGroupName}`);
        }
        return { kind: 'created', taskId: result.taskId };
      } catch (error: unknown) {
        if (!isLimitExceededException(error)) {
          throw error;
        }
        return { kind: 'limit_exceeded', reason: getErrorReason(error) };
      }
    });

    if (shouldRetryCreateExportAfterLimitExceeded(createResult)) {
      ctx.logger.warn('CreateExportTask LimitExceededException; waiting for export slot', {
        logGroupName,
        attempt: createAttempt,
        reason: createResult.reason,
        waitSeconds: LIMIT_EXCEEDED_WAIT_SECONDS,
      });
      await ctx.wait(`${stepName}-limit-exceeded-wait-${createAttempt}`, {
        seconds: LIMIT_EXCEEDED_WAIT_SECONDS,
      });
      createAttempt += 1;
    }
  } while (shouldRetryCreateExportAfterLimitExceeded(createResult));

  const taskId = createResult.taskId;

  const describeExportTaskStatus = async (): Promise<string> => {
    const { status } = await ctx.step(`${stepName}-describe`, async () => {
      const describe = await cwLogs.send(new DescribeExportTasksCommand({ taskId }));
      return { status: describe.exportTasks?.[0]?.status?.code ?? EXPORT_TASK_STATUS_PENDING };
    });
    return status;
  };

  let status = await describeExportTaskStatus();
  while (shouldWaitForExportTask(status)) {
    const wait = EXPORT_TASK_WAITS[exportTaskWait(status)];
    await ctx.wait(`${stepName}-${wait.stepSuffix}`, { seconds: wait.seconds });
    status = await describeExportTaskStatus();
  }

  if (isExportTaskFinished(status)) {
    return;
  }
  if (shouldRetryFailedExport(failureRetry)) {
    await ctx.wait(`${stepName}-retry-wait`, { seconds: PENDING_WAIT_SECONDS });
    return createExportLogGroup(
      ctx,
      `${stepName}-retry`,
      cwLogs,
      bucketName,
      logGroupName,
      target,
      ExportFailureRetry.Retried,
    );
  }
  throw new Error(`Export task ${taskId} failed for log group: ${logGroupName}`);
};

/**
 * Exports each UTC day in the window for one log group, oldest day first.
 * Days run one after another so each CreateExportTask gets that day's prefix.
 *
 * @param ctx - Durable execution context for the map item.
 * @param stepName - Base name for this log group (e.g. `"export-0"`).
 * @param cwLogs - CloudWatch Logs client.
 * @param bucketName - S3 bucket destination for the export.
 * @param logGroupName - Name of the log group to export.
 * @param windows - UTC days to export, oldest first.
 * @param destinationPrefixTemplate - Prefix template applied to each day.
 * @returns Resolves when every day in the window has completed.
 * @throws CloudWatchLogsArchiverValidateError when a rendered prefix is illegal.
 * @throws Error when an export task fails after one retry.
 */
const exportLogGroupDays = async (
  ctx: DurableContext,
  stepName: string,
  cwLogs: CloudWatchLogsClient,
  bucketName: string,
  logGroupName: string,
  windows: readonly UtcDayWindow[],
  destinationPrefixTemplate: string,
): Promise<void> => {
  for (let dayIndex = 0; dayIndex < windows.length; dayIndex += 1) {
    const window = windows[dayIndex];
    if (window === undefined) {
      throw new Error(`Missing export window at index ${dayIndex}.`);
    }
    const destinationPrefix = buildDestinationPrefix(destinationPrefixTemplate, {
      logGroupName,
      year: window.year,
      month: window.month,
      day: window.day,
    });
    await createExportLogGroup(
      ctx,
      `${stepName}-day-${dayIndex}`,
      cwLogs,
      bucketName,
      logGroupName,
      {
        from: window.from,
        to: window.to,
        destinationPrefix,
      },
      ExportFailureRetry.First,
    );
  }
};

/**
 * Durable Lambda handler for archiving CloudWatch Logs to S3.
 * Discovers log groups by tag via the Resource Groups Tagging API, then exports
 * the configured UTC window for each group to the configured S3 bucket.
 * With `FailureMode` `FAIL_FAST` (default) the run stops at the first failed log group;
 * with `CONTINUE` it exports every remaining group before failing.
 *
 * @param event - Scheduler input with `Params.TagKey`, `Params.TagValues`, and optional `Params.Export`.
 * @param context - Durable execution context (steps, map, logger).
 * @returns Object with `ExportedCount`: number of log groups successfully exported.
 * @throws {import('strict-env-resolver').StrictEnvValidationError} if `BUCKET_NAME` is not set.
 * @throws Error if `Params`, `Params.TagKey`, or `Params.TagValues` is missing or empty.
 * @throws CloudWatchLogsArchiverValidateError if `Params.Export` is present and invalid.
 * @throws Error if one or more log group exports fail. The message names the failed log groups
 *   and counts log groups not attempted after a `FAIL_FAST` stop.
 */
export const handler = withDurableExecution(async (event: ScheduleEvent, context: DurableContext): Promise<{ ExportedCount: number }> => {
  context.logger.info('Log archiver started', { hasTagKey: Boolean(event.Params?.TagKey) });

  const bucketName = StrictEnvResolver.resolve('BUCKET_NAME', StrictEnvType.String);

  const cwLogs = new CloudWatchLogsClient(createAwsClientConfig());
  let logGroupNames: string[];

  const params = event.Params;
  if (!params?.TagKey || !params?.TagValues) {
    throw new Error('Invalid event: Params.TagKey and Params.TagValues are required.');
  }

  const exportSettings = resolveExportSettings(params.Export);
  const windows = listUtcExportWindows(new Date(), exportSettings);

  logGroupNames = await context.step('get-resources', async () => {
    const taggingClient = new ResourceGroupsTaggingAPIClient(createAwsClientConfig());
    const arns: string[] = [];
    let paginationToken: string | undefined;
    do {
      const result = await taggingClient.send(new GetResourcesCommand({
        ResourceTypeFilters: ['logs:log-group'],
        TagFilters: [{ Key: params.TagKey, Values: params.TagValues }],
        PaginationToken: paginationToken,
      }));
      const list = result.ResourceTagMappingList ?? [];
      for (const m of list) {
        if (m.ResourceARN) arns.push(m.ResourceARN);
      }
      paginationToken = result.PaginationToken ?? undefined;
    } while (hasNextResourceTagPage(paginationToken));
    return arns.map(getLogGroupNameFromArn);
  });
  context.logger.info('Resolved log groups', { count: logGroupNames.length, tagKey: params.TagKey });

  const mapResult = await context.map(
    'export-log-groups',
    logGroupNames,
    async (ctx, logGroupName, index) => {
      await exportLogGroupDays(
        ctx,
        `export-${index}`,
        cwLogs,
        bucketName,
        logGroupName,
        windows,
        exportSettings.destinationPrefixTemplate,
      );
      return { logGroupName };
    },
    {
      maxConcurrency: 1,
      completionConfig: toExportCompletionConfig(exportSettings.failureMode),
    },
  );

  const exportedCount = mapResult.successCount;
  emitExportedCountMetricLog(exportedCount, resolveLambdaFunctionName());

  if (hasExportBatchFailure(mapResult.failureCount)) {
    const failedLogGroups = mapResult.failed().map((item) => logGroupNames[item.index] ?? `index ${item.index}`);
    const notAttemptedCount = logGroupNames.length - mapResult.successCount - mapResult.failureCount;
    context.logger.error(EXPORT_FAILURE_LOG_MESSAGE, {
      exportedCount,
      failureCount: mapResult.failureCount,
      notAttemptedCount,
      failureMode: exportSettings.failureMode,
      failedLogGroups,
    });
    throw new Error(getExportBatchFailureMessage({
      failedLogGroups,
      totalCount: logGroupNames.length,
      notAttemptedCount,
    }));
  }

  context.logger.info('Log archiver completed', { exportedCount });
  return { ExportedCount: exportedCount };
});
