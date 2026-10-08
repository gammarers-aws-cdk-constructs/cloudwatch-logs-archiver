import { CloudWatchLogsArchiverValidateError } from '../../src/funcs/core/cloudwatch-logs-archiver-errors';
import { resolveExportSettings } from '../../src/funcs/core/resolve-export-settings';

describe('resolveExportSettings', () => {
  it('uses the previous UTC day, one day, and the default prefix when Export is omitted', () => {
    expect(resolveExportSettings(undefined)).toEqual({
      endOffsetDays: 1,
      spanDays: 1,
      destinationPrefixTemplate: '{logGroup}/{yyyy}/{mm}/{dd}/',
    });
  });

  it('keeps defaults for fields that are omitted', () => {
    expect(resolveExportSettings({ SpanDays: 7 })).toEqual({
      endOffsetDays: 1,
      spanDays: 7,
      destinationPrefixTemplate: '{logGroup}/{yyyy}/{mm}/{dd}/',
    });
  });

  it('accepts a full Export object', () => {
    expect(resolveExportSettings({
      EndOffsetDays: 2,
      SpanDays: 3,
      DestinationPrefixTemplate: '{yyyy}/{mm}/{dd}/{logGroup}/',
    })).toEqual({
      endOffsetDays: 2,
      spanDays: 3,
      destinationPrefixTemplate: '{yyyy}/{mm}/{dd}/{logGroup}/',
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
  ])('rejects Export when it is $name', ({ raw }) => {
    expect(() => resolveExportSettings(raw)).toThrow(CloudWatchLogsArchiverValidateError);
  });
});
