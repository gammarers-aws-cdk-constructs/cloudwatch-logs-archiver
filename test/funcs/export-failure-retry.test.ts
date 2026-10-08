import { ExportFailureRetry, shouldRetryFailedExport } from '../../src/funcs/core/export-failure-retry';

describe('shouldRetryFailedExport', () => {
  it.each([
    { name: 'first failure', failureRetry: ExportFailureRetry.First, expected: true },
    { name: 'already retried', failureRetry: ExportFailureRetry.Retried, expected: false },
  ])('$name', ({ failureRetry, expected }) => {
    expect(shouldRetryFailedExport(failureRetry)).toBe(expected);
  });
});
