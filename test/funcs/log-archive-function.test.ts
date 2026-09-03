import {
  DurableExecutionClient,
  DurableExecutionInvocationInput,
  DurableExecutionInvocationInputWithClient,
  DurableExecutionInvocationOutput,
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
import { Context } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { StrictEnvValidationError } from 'strict-env-resolver';
import { handler } from '../../src/funcs/log-archive.lambda';

/**
 * Scheduler / durable input shape matching EventBridge Scheduler target payload
 * (see `cloudwatch-logs-archiver` ScheduleTargetInput).
 */
type LogArchiveScheduleEvent = {
  Params: {
    TagKey: string;
    TagValues: string[];
  };
};

const SCHEDULE_EVENT: LogArchiveScheduleEvent = {
  Params: {
    TagKey: 'DailyLogExport',
    TagValues: ['Yes'],
  },
};

const LOG_GROUP_ARN_PREFIX = 'arn:aws:logs:us-east-1:123456789012:log-group:';

const FAKE_TIMER_PASSTHROUGH = [
  'nextTick',
  'queueMicrotask',
  'setImmediate',
  'setInterval',
  'setTimeout',
] as const;

/**
 * Completes durable WAIT operations immediately so unit tests do not hang
 * on Lambda checkpoint polling.
 */
const createMockDurableClient = (): DurableExecutionClient => ({
  getExecutionState: async () => ({ Operations: [] }),
  checkpoint: async (params) => {
    const operations = (params.Updates ?? []).flatMap((update) => {
      if (update.Type !== 'WAIT' || update.Action !== 'START' || !update.Id) {
        return [];
      }
      return [{
        Id: update.Id,
        ParentId: update.ParentId,
        Name: update.Name,
        Type: 'WAIT' as const,
        Status: 'SUCCEEDED' as const,
        StartTimestamp: new Date(0),
        EndTimestamp: new Date(0),
        WaitDetails: {
          ScheduledEndTimestamp: new Date(0),
        },
      }];
    });
    return {
      CheckpointToken: 'mock-token',
      NewExecutionState: { Operations: operations },
    };
  },
});

/** Durable Execution が受け取る形式でテスト用の invocation input を組み立てる */
const createInvocationInput = (userEvent: LogArchiveScheduleEvent): DurableExecutionInvocationInputWithClient => {
  const base: DurableExecutionInvocationInput = {
    DurableExecutionArn: 'arn:aws:durable-execution:test',
    CheckpointToken: 'test-token',
    InitialExecutionState: {
      Operations: [
        {
          Id: 'root-execution',
          ExecutionDetails: { InputPayload: JSON.stringify(userEvent) },
        },
      ] as DurableExecutionInvocationInput['InitialExecutionState']['Operations'],
    },
  };
  return new DurableExecutionInvocationInputWithClient(base, createMockDurableClient());
};

const invokeHandler = async (event: LogArchiveScheduleEvent): Promise<DurableExecutionInvocationOutput> =>
  handler(createInvocationInput(event), {} as Context);

const getSucceededPayload = (result: DurableExecutionInvocationOutput): unknown => {
  if (result.Status !== 'SUCCEEDED') {
    throw new Error(`expected SUCCEEDED, got ${JSON.stringify(result)}`);
  }
  return JSON.parse(result.Result ?? '{}');
};

const getFailedErrorMessage = (result: DurableExecutionInvocationOutput): string => {
  if (result.Status !== 'FAILED') {
    throw new Error(`expected FAILED, got ${JSON.stringify(result)}`);
  }
  return result.Error.ErrorMessage ?? '';
};

describe('Lambda Function Handler testing', () => {
  const cwLogsMock = mockClient(CloudWatchLogsClient);
  const taggingMock = mockClient(ResourceGroupsTaggingAPIClient);
  const originalBucketName = process.env.BUCKET_NAME;

  const mockCompletedExport = (logGroupNames: readonly string[]): void => {
    taggingMock.on(GetResourcesCommand).resolves({
      ResourceTagMappingList: logGroupNames.map((name) => ({
        ResourceARN: `${LOG_GROUP_ARN_PREFIX}${name}`,
      })),
    });
    cwLogsMock.on(CreateExportTaskCommand).resolves({
      taskId: 'cda45419-90ea-4db5-9833-aade86253e66',
    });
    cwLogsMock.on(DescribeExportTasksCommand).resolves({
      exportTasks: [{ status: { code: 'COMPLETED' } }],
    });
  };

  beforeEach(() => {
    cwLogsMock.reset();
    taggingMock.reset();
    process.env.BUCKET_NAME = 'example-log-archive-bucket';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalBucketName === undefined) {
      delete process.env.BUCKET_NAME;
      return;
    }
    process.env.BUCKET_NAME = originalBucketName;
  });

  describe('Tag-based schedule input (Params.TagKey / Params.TagValues)', () => {
    it('should resolve log groups by tag, call CreateExportTask, and return ExportedCount', async () => {
      mockCompletedExport(['example/log-group']);

      const result = await invokeHandler(SCHEDULE_EVENT);

      expect(getSucceededPayload(result)).toStrictEqual({ ExportedCount: 1 });
      expect(cwLogsMock.commandCalls(CreateExportTaskCommand)).toHaveLength(1);
      expect(cwLogsMock.commandCalls(CreateExportTaskCommand)[0].args[0].input).toMatchObject({
        destination: 'example-log-archive-bucket',
        logGroupName: 'example/log-group',
      });
    });

    it.each([
      {
        name: 'month boundary',
        nowIso: '2026-03-01T00:00:00.000Z',
        fromIso: '2026-02-28T00:00:00.000Z',
        toIso: '2026-02-28T23:59:59.999Z',
        destinationPrefix: 'example-log-group/2026/02/28/',
      },
      {
        name: 'year boundary',
        nowIso: '2026-01-01T13:01:00.000Z',
        fromIso: '2025-12-31T00:00:00.000Z',
        toIso: '2025-12-31T23:59:59.999Z',
        destinationPrefix: 'example-log-group/2025/12/31/',
      },
      {
        name: 'leap day previous',
        nowIso: '2024-03-01T08:00:00.000Z',
        fromIso: '2024-02-29T00:00:00.000Z',
        toIso: '2024-02-29T23:59:59.999Z',
        destinationPrefix: 'example-log-group/2024/02/29/',
      },
    ])('exports the previous UTC day window ($name)', async ({
      nowIso,
      fromIso,
      toIso,
      destinationPrefix,
    }) => {
      jest.useFakeTimers({
        now: new Date(nowIso),
        doNotFake: [...FAKE_TIMER_PASSTHROUGH],
      });
      mockCompletedExport(['example/log-group']);

      const result = await invokeHandler(SCHEDULE_EVENT);

      expect(getSucceededPayload(result)).toStrictEqual({ ExportedCount: 1 });
      expect(cwLogsMock.commandCalls(CreateExportTaskCommand)[0].args[0].input).toEqual({
        destination: 'example-log-archive-bucket',
        logGroupName: 'example/log-group',
        from: Date.parse(fromIso),
        to: Date.parse(toIso),
        destinationPrefix,
      });
    });

    it('retries CreateExportTask once when DescribeExportTasks returns FAILED', async () => {
      mockCompletedExport(['example/log-group']);
      cwLogsMock.on(DescribeExportTasksCommand)
        .resolvesOnce({ exportTasks: [{ status: { code: 'FAILED' } }] })
        .resolvesOnce({ exportTasks: [{ status: { code: 'COMPLETED' } }] });

      const result = await invokeHandler(SCHEDULE_EVENT);

      expect(getSucceededPayload(result)).toStrictEqual({ ExportedCount: 1 });
      expect(cwLogsMock.commandCalls(CreateExportTaskCommand)).toHaveLength(2);
      expect(cwLogsMock.commandCalls(DescribeExportTasksCommand)).toHaveLength(2);
    });

    it('returns FAILED when export remains FAILED after one retry', async () => {
      mockCompletedExport(['example/log-group']);
      cwLogsMock.on(DescribeExportTasksCommand).resolves({
        exportTasks: [{ status: { code: 'FAILED' } }],
      });

      const result = await invokeHandler(SCHEDULE_EVENT);

      expect(getFailedErrorMessage(result)).toContain('Export failed for 1 of 1 log group(s)');
    });

    it('follows Resource Groups Tagging API pagination and exports every page', async () => {
      taggingMock.on(GetResourcesCommand)
        .resolvesOnce({
          ResourceTagMappingList: [{ ResourceARN: `${LOG_GROUP_ARN_PREFIX}group-a` }],
          PaginationToken: 'page-2',
        })
        .resolvesOnce({
          ResourceTagMappingList: [{ ResourceARN: `${LOG_GROUP_ARN_PREFIX}group-b` }],
        });
      cwLogsMock.on(CreateExportTaskCommand).resolves({ taskId: 'task-1' });
      cwLogsMock.on(DescribeExportTasksCommand).resolves({
        exportTasks: [{ status: { code: 'COMPLETED' } }],
      });

      const result = await invokeHandler(SCHEDULE_EVENT);

      expect(getSucceededPayload(result)).toStrictEqual({ ExportedCount: 2 });
      expect(taggingMock.commandCalls(GetResourcesCommand)).toHaveLength(2);
      expect(taggingMock.commandCalls(GetResourcesCommand)[0].args[0].input).toMatchObject({
        ResourceTypeFilters: ['logs:log-group'],
        TagFilters: [{ Key: 'DailyLogExport', Values: ['Yes'] }],
      });
      expect(taggingMock.commandCalls(GetResourcesCommand)[1].args[0].input.PaginationToken).toBe('page-2');
      expect(cwLogsMock.commandCalls(CreateExportTaskCommand).map((call) => call.args[0].input.logGroupName))
        .toEqual(['group-a', 'group-b']);
    });
  });

  describe('Environment variable validation', () => {
    it('should return FAILED when BUCKET_NAME is not set', async () => {
      delete process.env.BUCKET_NAME;

      const result = await invokeHandler(SCHEDULE_EVENT);

      const errorMessage = getFailedErrorMessage(result);
      expect(errorMessage).toContain('BUCKET_NAME');
      expect(errorMessage).toContain('Missing required environment variable');

      const validationError = new StrictEnvValidationError([
        { key: 'BUCKET_NAME', message: 'Missing required environment variable: BUCKET_NAME', kind: 'missing' },
      ]);
      expect(errorMessage).toBe(validationError.message);
    });
  });

  describe('Input validation', () => {
    it.each([
      {
        name: 'missing Params',
        payload: {} as LogArchiveScheduleEvent,
      },
      {
        name: 'missing TagKey',
        payload: { Params: { TagValues: ['Yes'] } } as LogArchiveScheduleEvent,
      },
      {
        name: 'missing TagValues',
        payload: { Params: { TagKey: 'DailyLogExport' } } as LogArchiveScheduleEvent,
      },
      {
        name: 'empty TagKey',
        payload: { Params: { TagKey: '', TagValues: ['Yes'] } },
      },
    ])('should return FAILED when $name', async ({ payload }) => {
      const result = await invokeHandler(payload);

      expect(getFailedErrorMessage(result)).toContain('Params.TagKey');
    });
  });
});
