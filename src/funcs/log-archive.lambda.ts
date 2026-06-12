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
import { SafeEnvGetter, SafeEnvType } from 'safe-env-getter';

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
  };
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

/** Seconds to wait between polls when export task status is RUNNING. */
const RUNNING_WAIT_SECONDS = 10;

/** Seconds to wait when status is PENDING or before retrying. */
const PENDING_WAIT_SECONDS = 3;

/**
 * Creates a CloudWatch Logs export task for the given log group and polls until it completes.
 * Exports the previous calendar day's logs to the specified S3 bucket. Retries once on FAILED.
 *
 * @param ctx - Durable execution context for steps and waits.
 * @param stepName - Base name for step IDs (e.g. "export-0").
 * @param cwLogs - CloudWatch Logs client.
 * @param bucketName - S3 bucket destination for the export.
 * @param logGroupName - Name of the log group to export.
 * @param retried - Whether this invocation is already a retry (used to avoid infinite retry loop).
 * @returns Resolves when the export task completes (COMPLETED, CANCELLED, or PENDING_CANCEL).
 * @throws Error if CreateExportTask does not return a taskId or if the task fails after retry.
 */
const createExportLogGroup = async (
  ctx: DurableContext,
  stepName: string,
  cwLogs: CloudWatchLogsClient,
  bucketName: string,
  logGroupName: string,
  retried = false,
): Promise<void> => {
  const safeLogGroupName = logGroupName.replace(/\//g, '-').replace(/^-/, '').replace(/\./g, '--');
  const now = new Date();
  const targetFromTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime() - (1000 * 60 * 60 * 24);
  const targetToTime = targetFromTime + (1000 * 60 * 60 * 24) + 999;
  const targetDate = new Date(targetFromTime);
  const y = targetDate.getFullYear();
  const m = ('00' + (targetDate.getMonth() + 1)).slice(-2);
  const d = ('00' + (targetDate.getDate())).slice(-2);

  const createResult = await ctx.step(`${stepName}-create`, async () => {
    return cwLogs.send(new CreateExportTaskCommand({
      destination: bucketName,
      logGroupName,
      from: targetFromTime,
      to: targetToTime,
      destinationPrefix: `${safeLogGroupName}/${y}/${m}/${d}/`,
    }));
  });

  const taskId = createResult.taskId;
  if (!taskId) {
    throw new Error(`CreateExportTask did not return taskId for log group: ${logGroupName}`);
  }

  for (;;) {
    const { status } = await ctx.step(`${stepName}-describe`, async () => {
      const describe = await cwLogs.send(new DescribeExportTasksCommand({ taskId }));
      return { status: describe.exportTasks?.[0]?.status?.code ?? 'PENDING' };
    });

    if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'PENDING_CANCEL') {
      return;
    }
    if (status === 'FAILED') {
      if (!retried) {
        await ctx.wait(`${stepName}-retry-wait`, { seconds: PENDING_WAIT_SECONDS });
        return createExportLogGroup(ctx, `${stepName}-retry`, cwLogs, bucketName, logGroupName, true);
      }
      throw new Error(`Export task ${taskId} failed for log group: ${logGroupName}`);
    }
    if (status === 'RUNNING') {
      await ctx.wait(`${stepName}-running-wait`, { seconds: RUNNING_WAIT_SECONDS });
      continue;
    }
    // PENDING or unknown
    await ctx.wait(`${stepName}-pending-wait`, { seconds: PENDING_WAIT_SECONDS });
  }
};

/**
 * Durable Lambda handler for archiving CloudWatch Logs to S3.
 * Discovers log groups by tag via the Resource Groups Tagging API, then exports
 * the previous calendar day's logs for each group to the configured S3 bucket.
 *
 * @param event - Scheduler input with `Params.TagKey` and `Params.TagValues`.
 * @param context - Durable execution context (steps, map, logger).
 * @returns Object with `ExportedCount`: number of log groups successfully exported.
 * @throws {import('safe-env-getter').SafeEnvGetterValidationError} if `BUCKET_NAME` is not set.
 * @throws Error if `Params` are missing or invalid.
 */
export const handler = withDurableExecution(async (event: ScheduleEvent, context: DurableContext): Promise<{ ExportedCount: number }> => {
  context.logger.info('Log archiver started', { hasTagKey: Boolean(event.Params?.TagKey) });

  const bucketName = SafeEnvGetter.getEnv('BUCKET_NAME', SafeEnvType.String);

  const cwLogs = new CloudWatchLogsClient({});
  let logGroupNames: string[];

  const params = event.Params;
  if (!params?.TagKey || !params?.TagValues) {
    throw new Error('Invalid event: Params.TagKey, Params.TagValues, Params.Mode are required.');
  }
  logGroupNames = await context.step('get-resources', async () => {
    const taggingClient = new ResourceGroupsTaggingAPIClient({});
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
    } while (paginationToken);
    return arns.map(getLogGroupNameFromArn);
  });
  context.logger.info('Resolved log groups', { count: logGroupNames.length, tagKey: params.TagKey });

  const mapResult = await context.map(
    'export-log-groups',
    logGroupNames,
    async (ctx, logGroupName, index) => {
      await createExportLogGroup(
        ctx,
        `export-${index}`,
        cwLogs,
        bucketName,
        logGroupName,
      );
      return { logGroupName };
    },
    { maxConcurrency: 1 },
  );

  context.logger.info('Log archiver completed', { exportedCount: mapResult.successCount });
  return { ExportedCount: mapResult.successCount };
});
