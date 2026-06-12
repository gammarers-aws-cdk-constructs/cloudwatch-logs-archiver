import { awscdk, javascript, github } from 'projen';
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'yicr',
  authorAddress: 'yicr@users.noreply.github.com',
  cdkVersion: '2.232.0',
  defaultReleaseBranch: 'main',
  typescriptVersion: '5.9.x',
  jsiiVersion: '5.9.x',
  name: 'cloudwatch-logs-archiver',
  packageManager: javascript.NodePackageManager.YARN_CLASSIC,
  projenrcTs: true,
  repositoryUrl: 'https://github.com/gammarers-aws-cdk-constructs/cloudwatch-logs-archiver.git',
  description: 'An AWS CDK construct that archives CloudWatch Logs to S3 every day. Log groups are selected by resource tags; the previous calendar day\'s logs are exported to a secure S3 bucket on a fixed schedule (13:01 UTC).',
  keywords: [
    'cdk',
    'aws',
    'cloudwatch',
    'logs',
    'archive',
  ],
  deps: [
    's3-secure-bucket@^0.3.1',
  ],
  devDeps: [
    '@aws/durable-execution-sdk-js@^1.1.7',
    '@aws-sdk/client-cloudwatch-logs@^3.1063.0',
    '@aws-sdk/client-resource-groups-tagging-api@^3.1063.0',
    '@types/aws-lambda@^8.10.162',
    'aws-sdk-client-mock@^3.1.0',
    'aws-sdk-client-mock-jest@^3.1.0',
    'safe-env-getter@^0.3.4',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
  npmAccess: javascript.NpmAccess.PUBLIC,
  mergify: true,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
        workflows: github.workflows.AppPermission.WRITE,
      },
    }),
  },
  autoApproveOptions: {
    allowedUsernames: [
      'gammarers-projen-upgrade-bot[bot]',
      'yicr',
    ],
  },
  jestOptions: {
    extraCliOptions: ['--silent'],
  },
  tsconfigDev: {
    compilerOptions: {
      strict: true,
    },
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