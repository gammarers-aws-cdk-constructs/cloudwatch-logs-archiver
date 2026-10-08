# CloudWatch Logs Archiver (CDK v2)

[![npm version](https://img.shields.io/npm/v/cloudwatch-logs-archiver?style=flat-square)](https://www.npmjs.com/package/cloudwatch-logs-archiver)
[![license](https://img.shields.io/npm/l/cloudwatch-logs-archiver?style=flat-square)](https://www.npmjs.com/package/cloudwatch-logs-archiver)
[![Node.js](https://img.shields.io/node/v/cloudwatch-logs-archiver?style=flat-square)](https://www.npmjs.com/package/cloudwatch-logs-archiver)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/actions/workflows/build.yml)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudwatch-logs-archiver)](https://constructs.dev/packages/cloudwatch-logs-archiver)

An AWS CDK construct that archives CloudWatch Logs to S3 every day. Log groups are selected by resource tags; the previous UTC calendar day's logs are exported to a secure S3 bucket on a fixed schedule (13:01 UTC). Set `logExport` when the retention window or the S3 key layout should differ from that default.

## Features

- **Scheduled daily export** – EventBridge Scheduler runs once per day at 13:01 UTC.
- **Tag-based selection** – Uses the Resource Groups Tagging API to find CloudWatch Log groups by tag (e.g. `DailyLogExport` = `Yes`); only tagged groups are archived.
- **Durable Lambda execution** – Export logic runs in a single Lambda with [AWS Durable Execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started.html), creating export tasks and waiting until completion (up to 2 hours) so many log groups can be processed in one run.
- **Configurable UTC export window** – By default, exports the previous UTC calendar day (`00:00:00.000`–`23:59:59.999`) with S3 prefix `{logGroup}/{yyyy}/{mm}/{dd}/`. `logExport.endOffsetDays`, `logExport.spanDays` (1–31), and `logExport.destinationPrefixTemplate` change the window and key layout. Each day is its own export task, oldest day first. On the daily schedule, `spanDays` above 1 writes another copy of overlapping days, because each task id gets its own objects.
- **Export slot wait/retry** – On `LimitExceededException` (one concurrent export per account/region), waits with Durable execution and retries `CreateExportTask`, logging the failure reason.
- **Serial exports** – Processes one log group at a time so the account/region export quota is respected.
- **Secure bucket** – S3 bucket from [`s3-secure-bucket`](https://www.npmjs.com/package/s3-secure-bucket) (`CLOUD_WATCH_LOG_ARCHIVE_BUCKET`) with a resource policy allowing CloudWatch Logs export tasks to deliver data.
- **Versioned invocation** – Lambda alias `live` is used as the scheduler target for stable, versioned deployments.
- **Failure detection and notification** – Optional failure CloudWatch Alarms on Lambda errors, EventBridge Scheduler target errors / dropped invocations, and insufficient `ExportedCount`. Enable with `failureAlarm.enabled`, and pass an existing SNS topic as `failureAlarm.notificationTopic` to receive notifications (the construct never creates a topic).

## How it works

1. **Schedule** – EventBridge Scheduler invokes the Lambda alias daily at **13:01 UTC** with `Params.TagKey`, `Params.TagValues`, and, when you set `logExport`, `Params.Export`.
2. **Discovery** – The Lambda resolves matching CloudWatch Log groups via the Resource Groups Tagging API.
3. **Export** – For each log group (one at a time), it calls `CreateExportTask` once per UTC day in the window (default: the previous UTC calendar day, oldest day first) and waits on `DescribeExportTasks` until completion.
4. **Retries** – `LimitExceededException` triggers a Durable wait and another create attempt; a `FAILED` task status is retried once.
5. **Notify on failure** – If any export fails, the Lambda throws. When failure alarms are enabled (`failureAlarm.enabled` or `failureAlarm.notificationTopic`), CloudWatch Alarms fire on Lambda errors, Scheduler delivery failures, and insufficient `ExportedCount`. Notifications are sent only when you pass an existing SNS topic.

Tag the log groups you want to include (e.g. `DailyLogExport` = `Yes`); only those groups are archived.

## Installation

### npm

```bash
npm install cloudwatch-logs-archiver
```

### yarn

```bash
yarn add cloudwatch-logs-archiver
```

### pnpm

```bash
pnpm add cloudwatch-logs-archiver
```

## Usage

Use the construct inside your stack and pass the tag key and values used to select log groups. Only log groups that have this tag (with one of the given values) will be archived.

```typescript
import { CloudWatchLogsArchiver } from 'cloudwatch-logs-archiver';

new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
  targetResource: {
    tagKey: 'DailyLogExport',
    tagValues: ['Yes'],
  },
});
```

To receive failure notifications, pass an existing SNS topic. The construct does not create a topic. To create the alarms without a topic, set `failureAlarm.enabled` to `true` and omit `notificationTopic`.

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

To export more than the previous UTC day, or to change the S3 key layout:

```typescript
new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
  targetResource: {
    tagKey: 'DailyLogExport',
    tagValues: ['Yes'],
  },
  logExport: {
    endOffsetDays: 1,
    spanDays: 7,
    destinationPrefixTemplate: '{yyyy}/{mm}/{dd}/{logGroup}/',
  },
});
```

`spanDays` above 1 still runs on the daily schedule, so each later run exports the overlapping days again. CloudWatch Logs writes a new task id for every `CreateExportTask`, and those objects stay in the bucket.

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

For one-time or ad-hoc exports (for example a historical date range), see [AWS CloudWatch Logs Exporter](https://github.com/gammarers/aws-cloud-watch-logs-exporter). It can produce the same S3 key layout.

## Options

### `CloudWatchLogsArchiver`

| Option | Type | Description |
|--------|------|-------------|
| `targetResource` | `TargetResource` | Tag filter to identify which log groups to archive daily. |
| `failureAlarm` | `FailureAlarmOptions` | Optional failure alarms. Created when `enabled` is true or `notificationTopic` is set. |
| `logExport` | `LogExportOptions` | Optional UTC window and S3 prefix. Omitted properties keep the previous UTC day, one day, and `{logGroup}/{yyyy}/{mm}/{dd}/`. |

### `CloudWatchLogsArchiveStack`

Inherits standard [`StackProps`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.StackProps.html) plus the `CloudWatchLogsArchiver` options:

| Option | Type | Description |
|--------|------|-------------|
| `targetResource` | `TargetResource` | Tag filter passed through to `CloudWatchLogsArchiver`. |
| `failureAlarm` | `FailureAlarmOptions` | Passed through to `CloudWatchLogsArchiver`. |
| `logExport` | `LogExportOptions` | Passed through to `CloudWatchLogsArchiver`. |

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

### `LogExportOptions`

| Property | Type | Description |
|----------|------|-------------|
| `endOffsetDays` | `number` | UTC calendar days before today that the window ends on (default `1`, yesterday). Integer ≥ 1. |
| `spanDays` | `number` | How many UTC days to export, ending on that day (default `1`, maximum `31`). Each day is one `CreateExportTask`, oldest first. Above 1, the daily schedule exports overlapping days again and a new task id stores another copy. |
| `destinationPrefixTemplate` | `string` | S3 key prefix. Tokens in curly braces: `logGroup`, `yyyy`, `mm`, `dd`. Default `{logGroup}/{yyyy}/{mm}/{dd}/`. `logGroup` replaces `/` with `-`, removes one leading `-`, and replaces `.` with `--`. Other characters must be letters, digits, or `.` `-` `_` `/` `#`. |

## API

See [API.md](API.md).

## Requirements

- **Node.js** >= 20.0.0
- **AWS CDK** (peer): `aws-cdk-lib` ^2.232.0
- **Constructs** (peer): `constructs` ^10.5.1

## License

This project is licensed under the (Apache-2.0) License.
