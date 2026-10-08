import { ArnFormat, Duration, RemovalPolicy, Stack, TimeZone } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as targets from 'aws-cdk-lib/aws-scheduler-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { S3SecureBucket, S3SecureBucketType } from 's3-secure-bucket';
import { isFailureAlarmEnabled } from './is-failure-alarm-enabled';
import { toCfnAlarmDimensions } from './to-cfn-alarm-dimensions';
import {
  EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD,
  EXPORTED_COUNT_LOG_FIELD,
  EXPORTED_COUNT_METRIC_NAME,
  EXPORTED_COUNT_METRIC_NAMESPACE,
} from '../funcs/core/exported-count-metric';
import { LogArchiveFunction } from '../funcs/log-archive-function';
import {
  DESTINATION_PREFIX_CHARACTERS,
  DESTINATION_PREFIX_DAY_TOKEN,
  DESTINATION_PREFIX_LOG_GROUP_TOKEN,
  DESTINATION_PREFIX_MONTH_TOKEN,
  DESTINATION_PREFIX_TOKENS,
  DESTINATION_PREFIX_YEAR_TOKEN,
  MAX_DESTINATION_PREFIX_LENGTH,
  MAX_EXPORT_SPAN_DAYS,
  MIN_EXPORT_END_OFFSET_DAYS,
  MIN_EXPORT_SPAN_DAYS,
} from '../settings/consts';

/**
 * Tag filter used to select CloudWatch Log groups for archiving.
 * Log groups matching the given tag key and any of the values will be archived.
 */
export interface TargetResource {
  /** Tag key used for resource discovery. */
  readonly tagKey: string;
  /** Tag values matched by the scheduler target query. */
  readonly tagValues: string[];
}

/**
 * Failure-alarm and notification settings for {@link CloudWatchLogsArchiver}.
 * Creates CloudWatch Alarms for Scheduler/Lambda failures and insufficient ExportedCount.
 * The construct never creates an SNS topic; pass {@link FailureAlarmOptions.notificationTopic}
 * to receive ALARM-state notifications.
 */
export interface FailureAlarmOptions {
  /**
   * When `true`, failure CloudWatch Alarms are created even without a notification topic.
   * Specifying {@link FailureAlarmOptions.notificationTopic} also enables failure alarms.
   * @default false
   */
  readonly enabled?: boolean;
  /**
   * Existing SNS topic that receives failure ALARM-state notifications.
   * Specifying a topic also enables failure-alarm creation.
   * @default - no SNS notification
   */
  readonly notificationTopic?: sns.ITopic;
  /**
   * Minimum successful export count expected per daily run.
   * The ExportedCount alarm fires when the metric is below this value, or when no
   * datapoint is emitted (the run did not complete).
   * Set to `0` to alarm only when the metric is missing.
   * @default 1
   */
  readonly minExportedCount?: number;
}

/**
 * UTC calendar-day window and S3 key prefix for each export task.
 * Omitted properties keep yesterday, a one-day span, and `{logGroup}/{yyyy}/{mm}/{dd}/`.
 * Each day is a separate CreateExportTask, oldest day first.
 * On the daily schedule, a span above one day exports overlapping days again.
 * CloudWatch Logs stores each task under its own task id, so those objects accumulate in the bucket.
 */
export interface LogExportOptions {
  /**
   * UTC calendar days before today that the window ends on.
   * `1` ends the window on yesterday.
   * @default 1
   */
  readonly endOffsetDays?: number;
  /**
   * Number of UTC calendar days to export, ending on the day selected by `endOffsetDays`.
   * Must be an integer from 1 to 31.
   * @default 1
   */
  readonly spanDays?: number;
  /**
   * S3 key prefix passed to CreateExportTask.
   * Tokens, each wrapped in curly braces: `logGroup`, `yyyy`, `mm`, and `dd`.
   * `logGroup` is the log group name with `/` replaced by `-`, one leading `-` removed,
   * and `.` replaced by `--`.
   * Other characters must be legal in a CreateExportTask destination prefix
   * (letters, digits, and `.` `-` `_` `/` `#`).
   * @default '{logGroup}/{yyyy}/{mm}/{dd}/'
   */
  readonly destinationPrefixTemplate?: string;
}

/**
 * Props for creating a {@link CloudWatchLogsArchiver} construct.
 */
export interface CloudWatchLogsArchiverProps {
  /** Tag filter to identify which log groups to archive daily. */
  readonly targetResource: TargetResource;
  /**
   * Failure alarms for Scheduler/Lambda errors and insufficient ExportedCount.
   * Omit to skip alarm creation. Alarms are created when `enabled` is true or
   * {@link FailureAlarmOptions.notificationTopic} is set.
   * @default - failure alarms are not created
   */
  readonly failureAlarm?: FailureAlarmOptions;
  /**
   * Export window and S3 key prefix. Omit to export the previous UTC day under
   * `{logGroup}/{yyyy}/{mm}/{dd}/`.
   * @default - previous UTC day, one day, default prefix
   */
  readonly logExport?: LogExportOptions;
}

/** Default minimum successful exports per daily run. */
const DEFAULT_MIN_EXPORTED_COUNT = 1;

/**
 * Options for {@link CloudWatchLogsArchiver.addFailureAlarm}.
 */
interface AddFailureAlarmOptions {
  /** Human-readable alarm description shown in CloudWatch and SNS. */
  readonly alarmDescription: string;
  /** How the metric is compared to {@link AddFailureAlarmOptions.threshold}. */
  readonly comparisonOperator: cloudwatch.ComparisonOperator;
  /** Optional SNS topic that receives ALARM-state notifications. */
  readonly notificationTopic?: sns.ITopic;
  /** Alarm threshold. */
  readonly threshold: number;
  /** How missing datapoints are treated. */
  readonly treatMissingData: cloudwatch.TreatMissingData;
}

/**
 * Inputs for {@link CloudWatchLogsArchiver.addFailureAlarms}.
 */
interface AddFailureAlarmsParams {
  readonly lambdaFunction: lambda.IFunction;
  readonly lambdaLogGroup: logs.ILogGroup;
  readonly minExportedCount: number;
  readonly notificationTopic?: sns.ITopic;
  readonly scheduleGroup: scheduler.ScheduleGroup;
}

/** Scheduler payload fields included only when the caller set them. */
interface ScheduleExportInput {
  /** UTC days before today that the window ends on. */
  readonly EndOffsetDays?: number;
  /** Number of UTC calendar days in the window. */
  readonly SpanDays?: number;
  /** Destination prefix template. */
  readonly DestinationPrefixTemplate?: string;
}

const DESTINATION_PREFIX_PATTERN = new RegExp(`^[${DESTINATION_PREFIX_CHARACTERS}]+$`);
const DESTINATION_PREFIX_LITERAL_PATTERN = new RegExp(`^[${DESTINATION_PREFIX_CHARACTERS}]*$`);
const KNOWN_DESTINATION_PREFIX_TOKENS = new Set<string>(DESTINATION_PREFIX_TOKENS);
const KNOWN_DESTINATION_PREFIX_TOKEN_PATTERN = new RegExp(
  DESTINATION_PREFIX_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);
const BRACED_TOKEN_PATTERN = /\{[^{}]*\}/g;

/**
 * Rejects an end offset that is not an integer of at least the configured minimum.
 *
 * @param value - `logExport.endOffsetDays`.
 * @throws Error when the value is not an allowed integer. CDK synth surfaces this as a construct error.
 */
const assertExportEndOffsetDays = (value: number): void => {
  if (Number.isInteger(value) && value >= MIN_EXPORT_END_OFFSET_DAYS) {
    return;
  }
  throw new Error(
    `logExport.endOffsetDays must be an integer greater than or equal to ${MIN_EXPORT_END_OFFSET_DAYS}.`,
  );
};

/**
 * Rejects a span that is not an integer within the configured minimum and maximum.
 *
 * @param value - `logExport.spanDays`.
 * @throws Error when the value is outside the allowed range.
 */
const assertExportSpanDays = (value: number): void => {
  if (Number.isInteger(value) && value >= MIN_EXPORT_SPAN_DAYS && value <= MAX_EXPORT_SPAN_DAYS) {
    return;
  }
  throw new Error(
    `logExport.spanDays must be an integer from ${MIN_EXPORT_SPAN_DAYS} to ${MAX_EXPORT_SPAN_DAYS}.`,
  );
};

/**
 * Rejects a prefix template that cannot produce a CreateExportTask destination prefix.
 * Uses the same character set and token list as the Lambda, with a short sample log group name.
 *
 * @param template - `logExport.destinationPrefixTemplate`.
 * @throws Error when the template is empty, has an unknown token, or cannot meet the prefix limits.
 */
const assertDestinationPrefixTemplate = (template: string): void => {
  if (template.length === 0) {
    throw new Error('logExport.destinationPrefixTemplate must not be empty.');
  }

  const unsupported = template.match(BRACED_TOKEN_PATTERN)?.find((token) => !KNOWN_DESTINATION_PREFIX_TOKENS.has(token));
  if (unsupported !== undefined) {
    throw new Error(`logExport.destinationPrefixTemplate contains unsupported token ${unsupported}.`);
  }

  const literals = template.replace(KNOWN_DESTINATION_PREFIX_TOKEN_PATTERN, '');
  if (!DESTINATION_PREFIX_LITERAL_PATTERN.test(literals)) {
    throw new Error(
      'logExport.destinationPrefixTemplate contains characters that CreateExportTask destinationPrefix rejects.',
    );
  }

  const sample = template
    .replaceAll(DESTINATION_PREFIX_LOG_GROUP_TOKEN, 'a')
    .replaceAll(DESTINATION_PREFIX_YEAR_TOKEN, '2026')
    .replaceAll(DESTINATION_PREFIX_MONTH_TOKEN, '01')
    .replaceAll(DESTINATION_PREFIX_DAY_TOKEN, '01');
  if (sample.length > MAX_DESTINATION_PREFIX_LENGTH || !DESTINATION_PREFIX_PATTERN.test(sample)) {
    throw new Error('logExport.destinationPrefixTemplate exceeds the CreateExportTask destinationPrefix limits.');
  }
};

/**
 * Validates `logExport` and returns only the fields the caller set, for the scheduler input.
 * An omitted or empty options object returns `undefined` so the Lambda keeps its defaults
 * and the synthesized schedule input stays unchanged.
 *
 * @param logExport - Construct prop, if provided.
 * @returns Partial export payload, or `undefined` when nothing was set.
 * @throws Error when a set field fails validation.
 */
const toScheduleExportInput = (logExport: LogExportOptions | undefined): ScheduleExportInput | undefined => {
  if (logExport === undefined) {
    return undefined;
  }
  if (logExport.endOffsetDays !== undefined) {
    assertExportEndOffsetDays(logExport.endOffsetDays);
  }
  if (logExport.spanDays !== undefined) {
    assertExportSpanDays(logExport.spanDays);
  }
  if (logExport.destinationPrefixTemplate !== undefined) {
    assertDestinationPrefixTemplate(logExport.destinationPrefixTemplate);
  }

  const input: ScheduleExportInput = {
    ...(logExport.endOffsetDays === undefined ? {} : { EndOffsetDays: logExport.endOffsetDays }),
    ...(logExport.spanDays === undefined ? {} : { SpanDays: logExport.spanDays }),
    ...(logExport.destinationPrefixTemplate === undefined
      ? {}
      : { DestinationPrefixTemplate: logExport.destinationPrefixTemplate }),
  };
  if (Object.keys(input).length === 0) {
    return undefined;
  }
  return input;
};

/**
 * CDK construct that sets up archiving of CloudWatch Logs to S3.
 * Creates an S3 bucket, a durable Lambda function, and an EventBridge Scheduler
 * that invokes the function daily to export tagged log groups to the bucket.
 * Optional failure CloudWatch Alarms can notify an existing SNS topic on Scheduler/Lambda
 * failure or insufficient export count.
 */
export class CloudWatchLogsArchiver extends Construct {
  /**
   * Creates a CloudWatch Logs archive solution.
   *
   * @param scope - Parent construct (e.g. Stack).
   * @param id - Construct ID.
   * @param props - Configuration including the tag filter for target log groups.
   */
  constructor(scope: Construct, id: string, props: CloudWatchLogsArchiverProps) {
    super(scope, id);

    const exportInput = toScheduleExportInput(props.logExport);

    const logArchiveBucket = new S3SecureBucket(this, 'LogArchiveBucket', {
      bucketType: S3SecureBucketType.CLOUD_WATCH_LOG_ARCHIVE_BUCKET,
    });

    const lambdaLogGroup = new logs.LogGroup(this, 'LambdaFunctionLogGroup', {
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // 👇 Create Lambda Function
    const logArchiveFunction = new LogArchiveFunction(this, 'LogArchiveFunction', {
      description: 'A function to archive logs s3 bucket from CloudWatch Logs.',
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.minutes(15),
      memorySize: 512,
      retryAttempts: 2,
      durableConfig: {
        executionTimeout: Duration.hours(2),
        retentionPeriod: Duration.days(1),
      },
      environment: {
        BUCKET_NAME: logArchiveBucket.bucketName,
      },
      role: new iam.Role(this, 'LambdaExecutionRole', {
        description: 'daily CloudWatch Logs archive lambda exec role.',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicDurableExecutionRolePolicy'),
        ],
      }),
      logGroup: lambdaLogGroup,
      loggingFormat: lambda.LoggingFormat.JSON,
      systemLogLevelV2: lambda.SystemLogLevel.INFO,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
    });
    logArchiveFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'LogArchiveBucketAccess',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetBucketAcl',
        's3:PutObject',
      ],
      resources: [
        logArchiveBucket.bucketArn,
        logArchiveBucket.bucketArn + '/*',
      ],
    }));
    logArchiveFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'ResourceGroupsTaggingGetResources',
      effect: iam.Effect.ALLOW,
      actions: ['tag:GetResources'],
      resources: ['*'],
    }));
    logArchiveFunction.addToRolePolicy(new iam.PolicyStatement({
      sid: 'CloudWatchLogsExport',
      effect: iam.Effect.ALLOW,
      actions: [
        'logs:CreateExportTask',
        'logs:DescribeExportTasks',
      ],
      resources: ['*'],
    }));

    // https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started-iac.html
    const logArchiveFunctionAlias = new lambda.Alias(this, 'LogArchiveFunctionAlias', {
      aliasName: 'live',
      version: logArchiveFunction.currentVersion,
    });

    const scheduleGroup = new scheduler.ScheduleGroup(this, 'LogArchiveScheduleGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Schedule (Durable Functions: Lambda performs tag lookup, export, and polling in one run)
    new scheduler.Schedule(this, 'LogArchiveSchedule', {
      description: 'daily CloudWatch Logs archive schedule',
      enabled: true,
      scheduleGroup,
      schedule: scheduler.ScheduleExpression.cron({
        minute: '1',
        hour: '13',
        timeZone: TimeZone.ETC_UTC,
      }),
      target: new targets.LambdaInvoke(logArchiveFunctionAlias, {
        input: scheduler.ScheduleTargetInput.fromObject({
          Params: {
            TagKey: props.targetResource.tagKey,
            TagValues: props.targetResource.tagValues,
            ...(exportInput === undefined ? {} : { Export: exportInput }),
          },
        }),
      }),
    });

    if (!isFailureAlarmEnabled(props.failureAlarm)) {
      return;
    }

    const notificationTopic = props.failureAlarm?.notificationTopic;
    if (notificationTopic !== undefined) {
      this.grantFailureAlarmPublish(notificationTopic);
    }

    this.addFailureAlarms({
      lambdaFunction: logArchiveFunction,
      lambdaLogGroup,
      minExportedCount: props.failureAlarm?.minExportedCount ?? DEFAULT_MIN_EXPORTED_COUNT,
      notificationTopic,
      scheduleGroup,
    });
  }

  /**
   * Allows failure CloudWatch Alarms in this account to publish to the given SNS topic.
   */
  private grantFailureAlarmPublish(topic: sns.ITopic): void {
    topic.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudWatchAlarmsPublish',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
      actions: ['sns:Publish'],
      resources: [topic.topicArn],
      conditions: {
        ArnLike: {
          'aws:SourceArn': Stack.of(this).formatArn({
            service: 'cloudwatch',
            resource: 'alarm',
            resourceName: '*',
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }),
        },
        StringEquals: {
          'aws:SourceAccount': Stack.of(this).account,
        },
      },
    }));
  }

  /**
   * Wires failure CloudWatch Alarms for Lambda errors, Scheduler delivery failures,
   * and insufficient ExportedCount. Publishes to SNS when a topic is provided.
   */
  private addFailureAlarms(params: AddFailureAlarmsParams): void {
    const { lambdaFunction, lambdaLogGroup, minExportedCount, notificationTopic, scheduleGroup } = params;

    this.addFailureAlarm(
      'LambdaErrorsAlarm',
      lambdaFunction.metricErrors({
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      {
        alarmDescription: 'CloudWatch Logs Archiver Lambda reported Errors >= 1.',
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        notificationTopic,
        threshold: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    this.addFailureAlarm(
      'SchedulerTargetErrorsAlarm',
      scheduleGroup.metricTargetErrors({
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      {
        alarmDescription: 'EventBridge Scheduler target returned an error invoking the archive Lambda.',
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        notificationTopic,
        threshold: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    this.addFailureAlarm(
      'SchedulerDroppedInvocationsAlarm',
      scheduleGroup.metricDropped({
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.SUM,
      }),
      {
        alarmDescription: 'EventBridge Scheduler dropped archive invocations after exhausting retries.',
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        notificationTopic,
        threshold: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );

    const exportedCountMetricFilter = new logs.MetricFilter(this, 'ExportedCountMetricFilter', {
      logGroup: lambdaLogGroup,
      metricNamespace: EXPORTED_COUNT_METRIC_NAMESPACE,
      metricName: EXPORTED_COUNT_METRIC_NAME,
      filterPattern: logs.FilterPattern.all(
        logs.FilterPattern.exists(`$.message.${EXPORTED_COUNT_LOG_FIELD}`),
        logs.FilterPattern.exists(`$.message.${EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD}`),
      ),
      metricValue: `$.message.${EXPORTED_COUNT_LOG_FIELD}`,
      dimensions: {
        FunctionName: `$.message.${EXPORTED_COUNT_FUNCTION_NAME_LOG_FIELD}`,
      },
      unit: cloudwatch.Unit.COUNT,
    });

    this.addFailureAlarm(
      'ExportedCountAlarm',
      exportedCountMetricFilter.metric({
        period: Duration.days(1),
        statistic: cloudwatch.Stats.MAXIMUM,
        dimensionsMap: {
          FunctionName: lambdaFunction.functionName,
        },
      }),
      {
        alarmDescription:
          `CloudWatch Logs Archiver ExportedCount is below ${minExportedCount}, or the daily run did not emit a datapoint.`,
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        notificationTopic,
        threshold: minExportedCount,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      },
    );
  }

  /**
   * Creates a failure CloudWatch Alarm. When a topic is provided, ALARM state publishes to SNS.
   */
  private addFailureAlarm(id: string, metric: cloudwatch.Metric, options: AddFailureAlarmOptions): void {
    const alarmActions = options.notificationTopic === undefined
      ? undefined
      : [options.notificationTopic.topicArn];

    new cloudwatch.CfnAlarm(this, id, {
      alarmActions,
      alarmDescription: options.alarmDescription,
      comparisonOperator: options.comparisonOperator,
      dimensions: toCfnAlarmDimensions(metric.dimensions),
      evaluationPeriods: 1,
      metricName: metric.metricName,
      namespace: metric.namespace,
      period: metric.period.toSeconds(),
      statistic: metric.statistic,
      threshold: options.threshold,
      treatMissingData: options.treatMissingData,
    });
  }
}
