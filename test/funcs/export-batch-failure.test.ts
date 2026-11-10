import {
  getExportBatchFailureMessage,
  hasExportBatchFailure,
  toExportCompletionConfig,
} from '../../src/funcs/core/export-batch-failure';

describe('hasExportBatchFailure', () => {
  it.each([
    { name: 'zero failures', failureCount: 0, expected: false },
    { name: 'one failure', failureCount: 1, expected: true },
    { name: 'multiple failures', failureCount: 3, expected: true },
  ])('$name', ({ failureCount, expected }) => {
    expect(hasExportBatchFailure(failureCount)).toBe(expected);
  });
});

describe('toExportCompletionConfig', () => {
  it.each([
    { failureMode: 'FAIL_FAST' as const, expected: undefined },
    { failureMode: 'CONTINUE' as const, expected: { toleratedFailurePercentage: 100 } },
  ])('$failureMode', ({ failureMode, expected }) => {
    expect(toExportCompletionConfig(failureMode)).toEqual(expected);
  });
});

describe('getExportBatchFailureMessage', () => {
  const manyGroups = Array.from({ length: 12 }, (_, index) => `group-${index + 1}`);

  it.each([
    {
      name: 'fail-fast stop with groups not attempted',
      summary: { failedLogGroups: ['group-a'], totalCount: 3, notAttemptedCount: 2 },
      expected: 'Export failed for 1 of 3 log group(s); 2 not attempted: group-a',
    },
    {
      name: 'continue with every group attempted',
      summary: { failedLogGroups: ['group-a', 'group-c'], totalCount: 4, notAttemptedCount: 0 },
      expected: 'Export failed for 2 of 4 log group(s): group-a, group-c',
    },
    {
      name: 'exactly ten failed groups',
      summary: { failedLogGroups: manyGroups.slice(0, 10), totalCount: 10, notAttemptedCount: 0 },
      expected: `Export failed for 10 of 10 log group(s): ${manyGroups.slice(0, 10).join(', ')}`,
    },
    {
      name: 'more than ten failed groups',
      summary: { failedLogGroups: manyGroups, totalCount: 12, notAttemptedCount: 0 },
      expected: `Export failed for 12 of 12 log group(s): ${manyGroups.slice(0, 10).join(', ')}, and 2 more`,
    },
  ])('$name', ({ summary, expected }) => {
    expect(getExportBatchFailureMessage(summary)).toBe(expected);
  });
});
