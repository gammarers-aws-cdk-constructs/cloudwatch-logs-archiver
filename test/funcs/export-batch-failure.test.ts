import { getExportBatchFailureMessage, hasExportBatchFailure } from '../../src/funcs/core/export-batch-failure';

describe('hasExportBatchFailure', () => {
  it.each([
    { name: 'zero failures', failureCount: 0, expected: false },
    { name: 'one failure', failureCount: 1, expected: true },
    { name: 'multiple failures', failureCount: 3, expected: true },
  ])('$name', ({ failureCount, expected }) => {
    expect(hasExportBatchFailure(failureCount)).toBe(expected);
  });
});

describe('getExportBatchFailureMessage', () => {
  it.each([
    {
      name: 'partial failure',
      failureCount: 1,
      totalCount: 4,
      expected: 'Export failed for 1 of 4 log group(s)',
    },
    {
      name: 'total failure',
      failureCount: 2,
      totalCount: 2,
      expected: 'Export failed for 2 of 2 log group(s)',
    },
  ])('$name', ({ failureCount, totalCount, expected }) => {
    expect(getExportBatchFailureMessage(failureCount, totalCount)).toBe(expected);
  });
});
