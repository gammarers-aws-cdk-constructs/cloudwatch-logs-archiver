# CloudWatch Logs Archiver (AWS CDK v2)

[![GitHub](https://img.shields.io/github/license/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver?style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/blob/main/LICENSE)
[![npm version](https://img.shields.io/npm/v/cloudwatch-logs-archiver?style=flat-square)](https://www.npmjs.com/package/cloudwatch-logs-archiver)
[![GitHub Workflow Status (branch)](https://img.shields.io/github/actions/workflow/status/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/release.yml?branch=main&label=release&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/actions/workflows/release.yml)
[![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver?sort=semver&style=flat-square)](https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver/releases)

[![View on Construct Hub](https://constructs.dev/badge?package=cloudwatch-logs-archiver)](https://constructs.dev/packages/cloudwatch-logs-archiver)

An AWS CDK construct that archives CloudWatch Logs to S3 every day. Log groups are selected by resource tags; the previous calendar day's logs are exported to a secure S3 bucket on a fixed schedule (13:01 UTC).

## Features

- **Scheduled daily export** – EventBridge Scheduler runs once per day at 13:01 UTC.
- **Tag-based selection** – Uses the Resource Groups Tagging API to find CloudWatch Log groups by tag (e.g. `DailyLogExport` = `Yes`); only tagged groups are archived.
- **Durable Lambda execution** – Export logic runs in a single Lambda with [AWS Durable Execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started.html), creating export tasks and polling until completion (up to 2 hours) so many log groups can be processed in one run.
- **Structured S3 layout** – Exports the previous calendar day (00:00:00–23:59:59.999 UTC) per log group to S3 with prefix `{logGroupName}/{YYYY}/{MM}/{DD}/`.
- **Secure bucket** – S3 bucket from `@gammarers/aws-secure-log-bucket` with a resource policy allowing CloudWatch Logs to deliver export data.
- **Versioned invocation** – Lambda alias `live` is used as the scheduler target for stable, versioned deployments.

## How it works

- **Schedule**: EventBridge Scheduler runs once per day at **13:01 UTC**.
- **Target selection**: The scheduler invokes the Lambda with `Params.TagKey` and `Params.TagValues`. The Lambda uses the Resource Groups Tagging API to find all CloudWatch Log groups that match that tag filter, then exports each group.
- **Durable Lambda**: The export logic runs inside a single Lambda using [AWS Durable Execution](https://docs.aws.amazon.com/lambda/latest/dg/durable-getting-started.html). The function creates export tasks, polls until they complete (with retries), and can run up to 2 hours so many log groups can be processed in one run.
- **Export**: For each log group, a `CreateExportTask` is issued for the **previous calendar day** (00:00:00–23:59:59.999 UTC). Objects are written to S3 with the prefix `{logGroupName}/{YYYY}/{MM}/{DD}/`.

You tag the log groups you want to include (e.g. `DailyLogExport` = `Yes`); only those groups are archived.

## Resources created

- **S3 bucket** – Secure log bucket (from `@gammarers/aws-secure-log-bucket`) with a resource policy allowing CloudWatch Logs to deliver export data.
- **Lambda function** – Durable execution, ARM64, 15-minute timeout per invocation, 2-hour durable execution limit. Writes to the bucket and uses the tagging API.
- **Lambda execution role** – Basic + Durable Execution managed policies plus S3, `tag:GetResources`, and CloudWatch Logs export permissions.
- **Lambda log group** – 3-month retention for the archiver's own logs.
- **Lambda alias** – `live`, used as the scheduler target for versioned deployments.
- **EventBridge Scheduler** – Cron schedule and target (Lambda invoke with JSON input `{"Params":{"TagKey":"...","TagValues":["..."]}}`).

## Architecture

![architecture](/architecture.drawio.svg)

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

new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
  targetResource: {
    tagKey: 'DailyLogExport',
    tagValues: ['Yes'],
  },
});
```

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

### `CloudWatchLogsArchiveStack`

Inherits standard [`StackProps`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.StackProps.html) plus:

| Option | Type | Description |
|--------|------|-------------|
| `targetResource` | `TargetResource` | Tag filter passed through to `CloudWatchLogsArchiver`. |

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
