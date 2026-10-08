import { CloudWatchLogsArchiverValidateError } from '../../src/funcs/core/cloudwatch-logs-archiver-errors';
import { buildDestinationPrefix, sanitizeLogGroupName } from '../../src/funcs/core/destination-prefix';

const DEFAULT_TEMPLATE = '{logGroup}/{yyyy}/{mm}/{dd}/';

describe('sanitizeLogGroupName', () => {
  it.each([
    { name: 'replaces slashes', logGroupName: 'example/log-group', expected: 'example-log-group' },
    { name: 'removes one leading hyphen', logGroupName: '-example', expected: 'example' },
    { name: 'replaces dots after the leading hyphen', logGroupName: '.hidden/group', expected: '--hidden-group' },
  ])('$name', ({ logGroupName, expected }) => {
    expect(sanitizeLogGroupName(logGroupName)).toBe(expected);
  });
});

describe('buildDestinationPrefix', () => {
  const parts = {
    logGroupName: 'example/log-group',
    year: '2026',
    month: '07',
    day: '16',
  };

  it('renders the default layout', () => {
    expect(buildDestinationPrefix(DEFAULT_TEMPLATE, parts)).toBe('example-log-group/2026/07/16/');
  });

  it('renders a date-first template', () => {
    expect(buildDestinationPrefix('{yyyy}/{mm}/{dd}/{logGroup}/', parts)).toBe('2026/07/16/example-log-group/');
  });

  it('does not expand tokens that appear inside the sanitized log group name', () => {
    expect(() => buildDestinationPrefix(DEFAULT_TEMPLATE, {
      ...parts,
      logGroupName: 'group-{yyyy}',
    })).toThrow(/not a valid CreateExportTask prefix/);
  });

  it.each([
    { name: 'unknown token', template: '{bucket}/{yyyy}/' },
    { name: 'rejected character', template: '{logGroup}/{yyyy} {mm}/' },
    { name: 'empty template', template: '' },
    { name: 'template longer than 512 characters', template: 'a'.repeat(513) },
  ])('rejects $name', ({ template }) => {
    expect(() => buildDestinationPrefix(template, parts)).toThrow(CloudWatchLogsArchiverValidateError);
  });

  it('rejects a rendered prefix that contains characters from the log group name', () => {
    expect(() => buildDestinationPrefix(DEFAULT_TEMPLATE, {
      ...parts,
      logGroupName: 'bad:name',
    })).toThrow(CloudWatchLogsArchiverValidateError);
  });
});
