import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CloudWatchLogsArchiver,
  type CloudWatchLogsArchiverProps,
} from './cloudwatch-logs-archiver';

/**
 * Props for the {@link CloudWatchLogsArchiveStack}.
 * {@link CloudWatchLogsArchiver} options plus standard stack props.
 */
export interface CloudWatchLogsArchiveStackProps extends CloudWatchLogsArchiverProps, StackProps {}

/**
 * CDK Stack that deploys the daily CloudWatch Logs archive solution.
 * Contains a single {@link CloudWatchLogsArchiver} construct.
 */
export class CloudWatchLogsArchiveStack extends Stack {
  /**
   * Creates the stack and the daily archive construct.
   *
   * @param scope - Parent construct (e.g. App).
   * @param id - Stack ID.
   * @param props - Stack props, including the archive construct options.
   */
  constructor(scope: Construct, id: string, props: CloudWatchLogsArchiveStackProps) {
    super(scope, id, props);

    new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
      targetResource: props.targetResource,
      failureAlarm: props.failureAlarm,
      logExport: props.logExport,
    });
  }
}
