import { emitExportedCountMetricLog } from '../../src/funcs/core/exported-count-metric';

describe('emitExportedCountMetricLog', () => {
  const originalFunctionName = process.env.AWS_LAMBDA_FUNCTION_NAME;

  afterEach(() => {
    if (originalFunctionName === undefined) {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      return;
    }
    process.env.AWS_LAMBDA_FUNCTION_NAME = originalFunctionName;
  });

  it.each([
    {
      name: 'uses Lambda function name when set',
      functionName: 'log-archive-live',
      exportedCount: 3,
      expectedFunctionName: 'log-archive-live',
    },
    {
      name: 'falls back to unknown when function name is unset',
      functionName: undefined,
      exportedCount: 0,
      expectedFunctionName: 'unknown',
    },
  ])('$name', ({ functionName, exportedCount, expectedFunctionName }) => {
    if (functionName === undefined) {
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    } else {
      process.env.AWS_LAMBDA_FUNCTION_NAME = functionName;
    }
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      emitExportedCountMetricLog(exportedCount);
      expect(log).toHaveBeenCalledWith({
        exportedCount,
        functionName: expectedFunctionName,
      });
    } finally {
      log.mockRestore();
    }
  });
});
