import { ProjenCdkConstructLibrary } from '@gammarers/projen-projects';
import { awscdk } from 'projen';
const project = new ProjenCdkConstructLibrary({
  projenrcTs: true,
  releaseToNpm: true,
  npmTrustedPublishing: true,
  cdkVersion: '2.232.0',
  name: 'cloudwatch-logs-archiver',
  repository: 'https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver.git',
  description: 'An AWS CDK construct that archives CloudWatch Logs to S3 every day. Log groups are selected by resource tags; the previous calendar day\'s logs are exported to a secure S3 bucket on a fixed schedule (13:01 UTC).',
  keywords: ['cdk', 'aws', 'cloudwatch', 'logs', 'archive'],
  deps: [
    's3-secure-bucket@^0.4.0',
  ],
  devDeps: [
    '@gammarers/projen-projects@^0.2.1',
    '@aws/durable-execution-sdk-js@^1.1.7',
    '@aws-sdk/client-cloudwatch-logs@^3.1063.0',
    '@aws-sdk/client-resource-groups-tagging-api@^3.1063.0',
    '@types/aws-lambda@^8.10.162',
    'aws-sdk-client-mock@^3.1.0',
    'aws-sdk-client-mock-jest@^3.1.0',
    'strict-env-resolver@^0.6.4',
  ],
  jestOptions: {
    extraCliOptions: ['--silent'],
  },
  lambdaOptions: {
    // target node.js runtime
    runtime: awscdk.LambdaRuntime.NODEJS_24_X,
    bundlingOptions: {
      // list of node modules to exclude from the bundle
      externals: ['@aws-sdk/*'],
      sourcemap: true,
    },
  },
});
project.addPackageIgnore('/.devcontainer');
project.synth();