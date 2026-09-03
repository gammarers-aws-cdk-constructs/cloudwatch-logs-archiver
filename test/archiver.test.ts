import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { CloudWatchLogsArchiveStack, CloudWatchLogsArchiver } from '../src';

describe('CloudWatchLogsArchiveStack Testing', () => {
  const app = new App();

  const stack = new CloudWatchLogsArchiveStack(app, 'CloudWatchLogsArchiveStack', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
    targetResource: {
      tagKey: 'DailyLogExport',
      tagValues: ['Yes'],
    },
  });

  const template = Template.fromStack(stack);

  describe('Bucket Testing', () => {

    it('should have bucket encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: Match.objectEquals({
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            },
          ],
        }),
      });
    });

    it('should have bucket resource policy for CloudWatch Logs export', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'AllowCloudWatchLogsExportGetBucketAcl',
              Effect: 'Allow',
              Action: 's3:GetBucketAcl',
              Principal: {
                Service: 'logs.us-east-1.amazonaws.com',
              },
              Condition: {
                StringEquals: {
                  'aws:SourceAccount': ['123456789012'],
                },
                ArnLike: {
                  'aws:SourceArn': ['arn:aws:logs:us-east-1:123456789012:log-group:*'],
                },
              },
            }),
            Match.objectLike({
              Sid: 'AllowCloudWatchLogsExportPutObject',
              Effect: 'Allow',
              Action: 's3:PutObject',
              Principal: {
                Service: 'logs.us-east-1.amazonaws.com',
              },
              Condition: {
                StringEquals: {
                  's3:x-amz-acl': 'bucket-owner-full-control',
                  'aws:SourceAccount': ['123456789012'],
                },
                ArnLike: {
                  'aws:SourceArn': ['arn:aws:logs:us-east-1:123456789012:log-group:*'],
                },
              },
            }),
          ]),
        },
      });
    });

  });

  describe('Lambda Testing', () => {

    it('should have lambda execution role with basic and durable execution policies', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        Description: 'daily CloudWatch Logs archive lambda exec role.',
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Principal: { Service: 'lambda.amazonaws.com' },
              Action: 'sts:AssumeRole',
            }),
          ]),
        },
      });
    });

    it('should have lambda role policy for log archive bucket access', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: Match.arrayWith([
            Match.objectLike({
              Sid: 'LogArchiveBucketAccess',
              Effect: 'Allow',
              Action: ['s3:GetBucketAcl', 's3:PutObject'],
              Resource: Match.anyValue(),
            }),
          ]),
        },
        Roles: Match.arrayWith([
          { Ref: Match.stringLikeRegexp('LambdaExecutionRole.*') },
        ]),
      });
    });

    it('should have lambda function with durable config and archive settings', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Handler: 'index.handler',
        Runtime: 'nodejs24.x',
        Architectures: ['arm64'],
        Description: 'A function to archive logs s3 bucket from CloudWatch Logs.',
        Timeout: 900,
        MemorySize: 512,
        Code: {
          S3Bucket: Match.anyValue(),
          S3Key: Match.stringLikeRegexp('.*.zip'),
        },
        Environment: {
          Variables: {
            AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
            BUCKET_NAME: { Ref: Match.stringLikeRegexp('LogArchiveBucket.*') },
          },
        },
        Role: {
          'Fn::GetAtt': [Match.stringLikeRegexp('LambdaExecutionRole.*'), 'Arn'],
        },
        DurableConfig: {
          ExecutionTimeout: 7200,
          RetentionPeriodInDays: 1,
        },
      });
    });

    it('should have lambda alias for scheduler target', () => {
      template.hasResourceProperties('AWS::Lambda::Alias', {
        Name: 'live',
        FunctionVersion: Match.anyValue(),
      });
    });
  });

  describe('Schedule Testing', () => {

    it('should have scheduler role for lambda target', () => {
      template.hasResourceProperties('AWS::IAM::Role', Match.objectLike({
        AssumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Principal: { Service: 'scheduler.amazonaws.com' },
              Action: 'sts:AssumeRole',
              Condition: Match.anyValue(),
            }),
          ]),
        },
      }));
    });

    it('should have scheduler policy to invoke lambda alias', () => {
      template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'lambda:InvokeFunction',
              Resource: { Ref: Match.stringLikeRegexp('LogArchiveFunctionAlias.*') },
            }),
          ]),
        },
      }));
    });

    it('should have schedule that invokes lambda alias with tag key and values', () => {
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        Description: 'daily CloudWatch Logs archive schedule',
        State: 'ENABLED',
        FlexibleTimeWindow: { Mode: 'OFF' },
        ScheduleExpressionTimezone: 'Etc/UTC',
        ScheduleExpression: 'cron(1 13 * * ? *)',
        GroupName: Match.stringLikeRegexp('LogArchiveScheduleGroup'),
        Target: Match.objectLike({
          Arn: { Ref: Match.stringLikeRegexp('LogArchiveFunctionAlias.*') },
          Input: '{"Params":{"TagKey":"DailyLogExport","TagValues":["Yes"]}}',
          RoleArn: Match.anyValue(),
          RetryPolicy: Match.anyValue(),
        }),
      });
      template.resourceCountIs('AWS::Scheduler::Schedule', 1);
    });

    it('should have a dedicated schedule group for isolated metrics', () => {
      template.resourceCountIs('AWS::Scheduler::ScheduleGroup', 1);
    });
  });

  describe('Alarm Testing', () => {

    it('should not create SNS topics, alarms, or metric filters by default', () => {
      template.resourceCountIs('AWS::SNS::Topic', 0);
      template.resourceCountIs('AWS::SNS::TopicPolicy', 0);
      template.resourceCountIs('AWS::CloudWatch::Alarm', 0);
      template.resourceCountIs('AWS::Logs::MetricFilter', 0);
    });
  });

  describe('Snapshot Testing', () => {
    it('should match snapshot', () => {
      expect(template.toJSON()).toMatchSnapshot('archiver');
    });
  });
});

describe('CloudWatchLogsArchiveStack with failure alarms enabled', () => {
  const app = new App();
  const stack = new CloudWatchLogsArchiveStack(app, 'CloudWatchLogsArchiveStackAlarmsEnabled', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
    targetResource: {
      tagKey: 'DailyLogExport',
      tagValues: ['Yes'],
    },
    failureAlarm: {
      enabled: true,
    },
  });
  const template = Template.fromStack(stack);

  it('should not create an SNS topic', () => {
    template.resourceCountIs('AWS::SNS::Topic', 0);
    template.resourceCountIs('AWS::SNS::TopicPolicy', 0);
  });

  it('should create four operational alarms without SNS actions', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmDescription: 'CloudWatch Logs Archiver Lambda reported Errors >= 1.',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      AlarmActions: Match.absent(),
    });
  });

  it('should extract ExportedCount from Lambda JSON logs', () => {
    template.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '{ ($.message.exportedCount = "*") && ($.message.functionName = "*") }',
      MetricTransformations: Match.arrayWith([
        Match.objectLike({
          MetricNamespace: 'CloudWatchLogsArchiver',
          MetricName: 'ExportedCount',
          MetricValue: '$.message.exportedCount',
          Unit: 'Count',
        }),
      ]),
    });
  });
});

describe('CloudWatchLogsArchiver with failure alarm notification topic', () => {
  const app = new App();
  const stack = new Stack(app, 'CloudWatchLogsArchiveStackWithTopic', {
    env: {
      account: '123456789012',
      region: 'us-east-1',
    },
  });
  const existingTopic = new Topic(stack, 'ExistingAlarmTopic');
  new CloudWatchLogsArchiver(stack, 'CloudWatchLogsArchiver', {
    targetResource: {
      tagKey: 'DailyLogExport',
      tagValues: ['Yes'],
    },
    failureAlarm: {
      notificationTopic: existingTopic,
      minExportedCount: 3,
    },
  });
  const template = Template.fromStack(stack);

  it('should use the provided SNS topic and not create another', () => {
    template.resourceCountIs('AWS::SNS::Topic', 1);
  });

  it('should allow CloudWatch Alarms to publish to the SNS topic', () => {
    template.hasResourceProperties('AWS::SNS::TopicPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'AllowCloudWatchAlarmsPublish',
            Effect: 'Allow',
            Action: 'sns:Publish',
            Principal: { Service: 'cloudwatch.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  it('should notify the provided topic and use minExportedCount as the threshold', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmDescription: Match.stringLikeRegexp('ExportedCount is below 3'),
      ComparisonOperator: 'LessThanThreshold',
      Threshold: 3,
      AlarmActions: Match.arrayWith([
        { Ref: Match.stringLikeRegexp('ExistingAlarmTopic.*') },
      ]),
    });
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);
  });
});


