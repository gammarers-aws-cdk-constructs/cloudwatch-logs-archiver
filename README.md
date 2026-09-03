# CloudWatch Logs Archiver (AWS CDK v2)

[![GitHub](https://img.shields.io/github/license/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver?style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/cloudwatch-logs-archiver?style=flat-square)](https://www.npmjs.com/package/cloudwatch-logs-archiver)
[![GitHub Workflow Status (branch)](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/release.yml?branch=main&label=release&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/actions/workflows/release.yml)
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver?sort=semver&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/releases)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudwatch-logs-archiver)](https://constructs.dev/packages/cloudwatch-logs-archiver)

An AWS CDK construct that archives CloudWatch Logs to S3 every day. Log groups are selected by resource tags; the previous UTC calendar day's logs are exported to a secure S3 bucket on a fixed schedule (13:01 UTC).

## Features

- **Scheduled daily export** – EventBridge Scheduler runs once per day at 13:01 UTC.
- **Tag-based selection** – Uses the Resource Groups Tagging API to find CloudWatch Log groups by tag (e.g. `DailyLogExport` = `Yes`); only tagged groups are archived.
- **Durable Lambda execution** – Export logic runs in a single Lambda with [AWS Durable Execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started.html), creating export tasks and polling until completion (up to 2 hours) so many log groups can be processed in one run.
- **UTC previous-day window** – Exports the previous UTC calendar day (`00:00:00.000`–`23:59:59.999`) per log group to S3 with prefix `{logGroupName}/{YYYY}/{MM}/{DD}/`.
- **Export slot wait/retry** – On `LimitExceededException` (one concurrent export per account/region), waits with Durable execution and retries `CreateExportTask`, logging the failure reason.
- **Serial exports** – Processes log groups with `maxConcurrency: 1` to respect the account/region export quota.
- **Secure bucket** – S3 bucket from [`s3-secure-bucket`](https://www.npmjs.com/package/s3-secure-bucket) (`CLOUD_WATCH_LOG_ARCHIVE_BUCKET`) with a resource policy allowing CloudWatch Logs export tasks to deliver data.
- **Versioned invocation** – Lambda alias `live` is used as the scheduler target for stable, versioned deployments.
- **Failure detection and notification** – Optional failure CloudWatch Alarms on Lambda errors, EventBridge Scheduler target errors / dropped invocations, and insufficient `ExportedCount`. Enable with `failureAlarm.enabled`, and pass an existing SNS topic as `failureAlarm.notificationTopic` to receive notifications (the construct never creates a topic).

## How it works

1. **Schedule** – EventBridge Scheduler invokes the Lambda alias daily at **13:01 UTC** with `Params.TagKey` and `Params.TagValues`.
2. **Discovery** – The Lambda resolves matching CloudWatch Log groups via the Resource Groups Tagging API.
3. **Export** – For each log group (one at a time), it calls `CreateExportTask` for the previous UTC calendar day and polls `DescribeExportTasks` until completion.
4. **Retries** – `LimitExceededException` triggers a Durable wait and another create attempt; a `FAILED` task status is retried once.
5. **Notify on failure** – If any export fails, the Lambda throws. When failure alarms are enabled (`failureAlarm.enabled` or `failureAlarm.notificationTopic`), CloudWatch Alarms fire on Lambda errors, Scheduler delivery failures, and insufficient `ExportedCount`. Notifications are sent only when you pass an existing SNS topic.

Tag the log groups you want to include (e.g. `DailyLogExport` = `Yes`); only those groups are archived.

## Resources created

- **S3 bucket** – Secure archive bucket (`s3-secure-bucket`, `CLOUD_WATCH_LOG_ARCHIVE_BUCKET`) with a resource policy for CloudWatch Logs export tasks.
- **Lambda function** – Durable execution, ARM64, 15-minute timeout per invocation, 2-hour durable execution limit. Writes to the bucket and uses the tagging API.
- **Lambda execution role** – Basic + Durable Execution managed policies plus S3, `tag:GetResources`, and CloudWatch Logs export permissions.
- **Lambda log group** – 3-month retention for the archiver's own logs.
- **Lambda alias** – `live`, used as the scheduler target for versioned deployments.
- **EventBridge Scheduler** – Dedicated schedule group, cron schedule, and target (Lambda invoke with JSON input `{"Params":{"TagKey":"...","TagValues":["..."]}}`).
- **CloudWatch Alarms** (optional) – Created when `failureAlarm.enabled` is true or `failureAlarm.notificationTopic` is set. Covers Lambda `Errors`, Scheduler `TargetErrorCount` / `InvocationDroppedCount`, and `ExportedCount` (from a log metric filter; missing daily datapoints are treated as breaching).
- **SNS notification** (optional) – When you pass `failureAlarm.notificationTopic`, ALARM state publishes to that existing topic. The construct does not create an SNS topic.

## Installation

**npm**

```bash
npm install cloudwatch-logs-archiver
```

**yarn**

```bash
yarn add cloudwatch-logs-archiver
```

**pnpm**

```bash
pnpm add cloudwatch-logs-archiver
```

## Usage

Use the construct inside your stack and pass the tag key and values used to select log groups. Only log groups that have this tag (with one of the given values) will be archived.

```typescript
import { CloudWatchLogsArchiver } from 'cloudwatch-logs-archiver';
import * as sns from 'aws-cdk-lib/aws-sns';

const failureAlarmTopic = new sns.Topic(this, 'ArchiverFailureAlarmTopic');

new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
  targetResource: {
    tagKey: 'DailyLogExport',
    tagValues: ['Yes'],
  },
  failureAlarm: {
    notificationTopic: failureAlarmTopic,
  },
});
```

To create failure CloudWatch Alarms without SNS notification, set `failureAlarm.enabled` to `true` and omit `notificationTopic`.

Alternatively, use the dedicated stack that contains the construct:

```typescript
import { CloudWatchLogsArchiveStack } from 'cloudwatch-logs-archiver';

new CloudWatchLogsArchiveStack(app, 'CloudWatchLogsArchiveStack', {
  targetResource: {
    tagKey: 'DailyLogExport',
    tagValues: ['Yes'],
  },
});
```

Ensure the CloudWatch Log groups you want to archive are tagged accordingly (e.g. `DailyLogExport` = `Yes`).

## Options

### `CloudWatchLogsArchiver`

| Option | Type | Description |
|--------|------|-------------|
| `targetResource` | `TargetResource` | Tag filter to identify which log groups to archive daily. |
| `failureAlarm` | `FailureAlarmOptions` | Optional failure alarms. Created when `enabled` is true or `notificationTopic` is set. |

### `CloudWatchLogsArchiveStack`

Inherits standard [`StackProps`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.StackProps.html) plus:

| Option | Type | Description |
|--------|------|-------------|
| `targetResource` | `TargetResource` | Tag filter passed through to `CloudWatchLogsArchiver`. |
| `failureAlarm` | `FailureAlarmOptions` | Passed through to `CloudWatchLogsArchiver`. |

### `FailureAlarmOptions`

| Property | Type | Description |
|----------|------|-------------|
| `enabled` | `boolean` | When `true`, create failure CloudWatch Alarms even without a topic (default `false`). Implied when `notificationTopic` is set. |
| `notificationTopic` | `sns.ITopic` | Existing SNS topic for failure ALARM-state notifications. Specifying a topic also enables failure alarms. The construct never creates a topic. |
| `minExportedCount` | `number` | Minimum `ExportedCount` expected per daily run (default `1`). The alarm fires below this value, or when no datapoint is emitted. Set to `0` to alarm only when the metric is missing. |

### `TargetResource`

| Property | Type | Description |
|----------|------|-------------|
| `tagKey` | `string` | Tag key used for discovery (e.g. `"DailyLogExport"`, `"Environment"`). |
| `tagValues` | `string[]` | Tag values to match; log groups with any of these values are included (e.g. `['Yes']`). |

## Requirements

- **Node.js** >= 20.0.0
- **AWS CDK** (peer): `aws-cdk-lib` ^2.232.0
- **Constructs** (peer): `constructs` ^10.5.1

## One-off or custom exports

For one-time or ad-hoc exports (e.g. historical date ranges), see [AWS CloudWatch Logs Exporter](https://github.com/gammarers/aws-cloud-watch-logs-exporter). It can produce the same S3 key layout.

## License

This project is licensed under the (Apache-2.0) License.
