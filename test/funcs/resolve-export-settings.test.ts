import { CloudWatchLogsArchiverValidateError } from '../../src/funcs/core/cloudwatch-logs-archiver-errors';
import { resolveExportSettings } from '../../src/funcs/core/resolve-export-settings';

describe('resolveExportSettings', () => {
  it('uses the previous UTC day, one day, the default prefix, and FAIL_FAST when Export is omitted', () => {
    expect(resolveExportSettings(undefined)).toEqual({
      endOffsetDays: 1,
      spanDays: 1,
      destinationPrefixTemplate: '{logGroup}/{yyyy}/{mm}/{dd}/',
      failureMode: 'FAIL_FAST',
    });
  });

  it('keeps defaults for fields that are omitted', () => {
    expect(resolveExportSettings({ SpanDays: 7 })).toEqual({
      endOffsetDays: 1,
      spanDays: 7,
      destinationPrefixTemplate: '{logGroup}/{yyyy}/{mm}/{dd}/',
      failureMode: 'FAIL_FAST',
    });
  });

  it('accepts a full Export object', () => {
    expect(resolveExportSettings({
      EndOffsetDays: 2,
      SpanDays: 3,
      DestinationPrefixTemplate: '{yyyy}/{mm}/{dd}/{logGroup}/',
      FailureMode: 'CONTINUE',
    })).toEqual({
      endOffsetDays: 2,
      spanDays: 3,
      destinationPrefixTemplate: '{yyyy}/{mm}/{dd}/{logGroup}/',
      failureMode: 'CONTINUE',
    });
  });

  it.each([
    { name: 'not an object', raw: 'yesterday' },
    { name: 'an array', raw: [] },
    { name: 'unsupported field', raw: { Mode: 'daily' } },
    { name: 'end offset zero', raw: { EndOffsetDays: 0 } },
    { name: 'fractional span', raw: { SpanDays: 1.5 } },
    { name: 'span above 31', raw: { SpanDays: 32 } },
    { name: 'template is not a string', raw: { DestinationPrefixTemplate: 1 } },
    { name: 'unknown template token', raw: { DestinationPrefixTemplate: '{week}/' } },
    { name: 'unknown failure mode', raw: { FailureMode: 'IGNORE' } },
    { name: 'lowercase failure mode', raw: { FailureMode: 'continue' } },
    { name: 'failure mode is not a string', raw: { FailureMode: true } },
  ])('rejects Export when it is $name', ({ raw }) => {
    expect(() => resolveExportSettings(raw)).toThrow(CloudWatchLogsArchiverValidateError);
  });

  it('names the allowed failure modes in the error', () => {
    expect(() => resolveExportSettings({ FailureMode: 'IGNORE' }))
      .toThrow('Params.Export.FailureMode must be one of FAIL_FAST, CONTINUE.');
  });
});
