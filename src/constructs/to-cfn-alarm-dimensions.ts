import type { CfnAlarm } from 'aws-cdk-lib/aws-cloudwatch';

/**
 * Maps a CloudWatch Metric dimension hash to CfnAlarm dimension properties.
 * String values are passed through; non-string values are CDK tokens used as dimension values.
 *
 * @param dimensions - Metric dimension map, or `undefined` when the metric has none.
 * @returns CfnAlarm dimensions, or `undefined` when there are no dimensions to emit.
 */
export const toCfnAlarmDimensions = (
  dimensions: { readonly [name: string]: unknown } | undefined,
): CfnAlarm.DimensionProperty[] | undefined => {
  if (dimensions === undefined) {
    return undefined;
  }
  const names = Object.keys(dimensions);
  if (names.length === 0) {
    return undefined;
  }
  return names.map((name) => {
    const value = dimensions[name];
    if (typeof value === 'string') {
      return { name, value };
    }
    // CDK tokens are objects at synth time and resolve to strings in CloudFormation.
    return { name, value: value as string };
  });
};
