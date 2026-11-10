import { emitExportedCountMetricLog } from '../../src/funcs/core/exported-count-metric';

describe('emitExportedCountMetricLog', () => {
  it.each([
    { exportedCount: 3, functionName: 'log-archive-live' },
    { exportedCount: 0, functionName: 'unknown' },
  ])('writes exportedCount $exportedCount for $functionName', ({ exportedCount, functionName }) => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      emitExportedCountMetricLog(exportedCount, functionName);
      expect(log).toHaveBeenCalledWith({ exportedCount, functionName });
    } finally {
      log.mockRestore();
    }
  });
});
