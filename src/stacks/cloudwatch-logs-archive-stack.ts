import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudWatchLogsArchiver, type TargetResource } from '../constructs/cloudwatch-logs-archiver';

/**
 * Props for the {@link CloudWatchLogsArchiveStack}.
 * Extends StackProps with the tag filter for target log groups.
 */
export interface CloudWatchLogsArchiveStackProps extends StackProps {
  /** Tag key and values used to select CloudWatch Log groups for daily archiving. */
  readonly targetResource: TargetResource;
}

/**
 * CDK Stack that deploys the daily CloudWatch Logs archive solution.
 * Contains a single {@link CloudWatchLogsArchiver} construct configured with the given tag filter.
 */
export class CloudWatchLogsArchiveStack extends Stack {
  /**
   * Creates the stack and the daily archive construct.
   *
   * @param scope - Parent construct (e.g. App).
   * @param id - Stack ID.
   * @param props - Stack props including targetResource for log group selection.
   */
  constructor(scope: Construct, id: string, props: CloudWatchLogsArchiveStackProps) {
    super(scope, id, props);

    new CloudWatchLogsArchiver(this, 'CloudWatchLogsArchiver', {
      targetResource: props.targetResource,
    });
  }
}
