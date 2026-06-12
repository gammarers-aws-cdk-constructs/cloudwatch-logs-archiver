import { Duration, RemovalPolicy, TimeZone } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as targets from 'aws-cdk-lib/aws-scheduler-targets';
import { Construct } from 'constructs';
import { S3SecureBucket, S3SecureBucketType } from 's3-secure-bucket';
import { LogArchiveFunction } from '../funcs/log-archive-function';

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
 * Props for creating a {@link CloudWatchLogsArchiver} construct.
 */
export interface CloudWatchLogsArchiverProps {
  /** Tag filter to identify which log groups to archive daily. */
  readonly targetResource: TargetResource;
}

/**
 * CDK construct that sets up archiving of CloudWatch Logs to S3.
 * Creates an S3 bucket, a durable Lambda function, and an EventBridge Scheduler
 * that invokes the function daily to export tagged log groups to the bucket.
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

    const logArchiveBucket = new S3SecureBucket(this, 'LogArchiveBucket', {
      bucketType: S3SecureBucketType.CLOUD_WATCH_LOG_ARCHIVE_BUCKET,
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
      logGroup: new logs.LogGroup(this, 'LambdaFunctionLogGroup', {
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
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

    // Schedule (Durable Functions: Lambda performs tag lookup, export, and polling in one run)
    new scheduler.Schedule(this, 'LogArchiveSchedule', {
      description: 'daily CloudWatch Logs archive schedule',
      enabled: true,
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
          },
        }),
      }),
    });
  }
}