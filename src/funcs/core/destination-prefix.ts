import { CloudWatchLogsArchiverValidateError } from './cloudwatch-logs-archiver-errors';
import {
  DESTINATION_PREFIX_CHARACTERS,
  DESTINATION_PREFIX_DAY_TOKEN,
  DESTINATION_PREFIX_LOG_GROUP_TOKEN,
  DESTINATION_PREFIX_MONTH_TOKEN,
  DESTINATION_PREFIX_TOKENS,
  DESTINATION_PREFIX_YEAR_TOKEN,
  MAX_DESTINATION_PREFIX_LENGTH,
} from '../../settings/consts';

/** CreateExportTask rejects an empty prefix and any character outside this set. */
const DESTINATION_PREFIX_PATTERN = new RegExp(`^[${DESTINATION_PREFIX_CHARACTERS}]+$`);

/** Characters that may sit outside tokens. Empty is allowed when tokens supply the prefix. */
const DESTINATION_PREFIX_LITERAL_PATTERN = new RegExp(`^[${DESTINATION_PREFIX_CHARACTERS}]*$`);

const KNOWN_DESTINATION_PREFIX_TOKENS = new Set<string>(DESTINATION_PREFIX_TOKENS);

const KNOWN_DESTINATION_PREFIX_TOKEN_PATTERN = new RegExp(
  DESTINATION_PREFIX_TOKENS.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'g',
);

const BRACED_TOKEN_PATTERN = /\{[^{}]*\}/g;

/**
 * Date and log group substituted into a destination prefix template.
 */
export interface DestinationPrefixParts {
  /** Raw CloudWatch Logs log group name, sanitized while rendering `{logGroup}`. */
  readonly logGroupName: string;
  /** Four-digit UTC year. */
  readonly year: string;
  /** Two-digit UTC month. */
  readonly month: string;
  /** Two-digit UTC day. */
  readonly day: string;
}

/**
 * Makes a log group name safe to embed in a destination prefix.
 * Replaces `/` with `-`, removes one leading `-`, then replaces `.` with `--`.
 *
 * @param logGroupName - CloudWatch Logs log group name.
 * @returns Sanitized name. Other characters are left unchanged.
 */
export const sanitizeLogGroupName = (logGroupName: string): string =>
  logGroupName.replace(/\//g, '-').replace(/^-/, '').replace(/\./g, '--');

/**
 * Rejects a template that cannot produce a CreateExportTask destination prefix.
 * Checks tokens, literal characters, and a minimum-length sample rendering.
 *
 * @param template - Prefix template from the scheduler input.
 * @throws CloudWatchLogsArchiverValidateError when the template is empty, has an unknown token,
 *   contains a rejected character, or the sample rendering exceeds the prefix limits.
 */
export const assertDestinationPrefixTemplate = (template: string): void => {
  if (template.length === 0) {
    throw new CloudWatchLogsArchiverValidateError('Params.Export.DestinationPrefixTemplate must not be empty.');
  }

  const unsupported = template.match(BRACED_TOKEN_PATTERN)?.find((token) => !KNOWN_DESTINATION_PREFIX_TOKENS.has(token));
  if (unsupported !== undefined) {
    throw new CloudWatchLogsArchiverValidateError(
      `Params.Export.DestinationPrefixTemplate contains unsupported token ${unsupported}.`,
    );
  }

  const literals = template.replace(KNOWN_DESTINATION_PREFIX_TOKEN_PATTERN, '');
  if (!DESTINATION_PREFIX_LITERAL_PATTERN.test(literals)) {
    throw new CloudWatchLogsArchiverValidateError(
      'Params.Export.DestinationPrefixTemplate contains characters that CreateExportTask destinationPrefix rejects.',
    );
  }

  const sample = template
    .replaceAll(DESTINATION_PREFIX_LOG_GROUP_TOKEN, 'a')
    .replaceAll(DESTINATION_PREFIX_YEAR_TOKEN, '2026')
    .replaceAll(DESTINATION_PREFIX_MONTH_TOKEN, '01')
    .replaceAll(DESTINATION_PREFIX_DAY_TOKEN, '01');
  if (sample.length > MAX_DESTINATION_PREFIX_LENGTH || !DESTINATION_PREFIX_PATTERN.test(sample)) {
    throw new CloudWatchLogsArchiverValidateError(
      'Params.Export.DestinationPrefixTemplate exceeds the CreateExportTask destinationPrefix limits.',
    );
  }
};

/**
 * Substitutes one known token. Unknown tokens are left in place for the prefix check to reject.
 *
 * @param token - Matched token, including braces.
 * @param parts - Values available for substitution.
 * @returns Replacement text.
 */
const replaceDestinationPrefixToken = (token: string, parts: DestinationPrefixParts): string => {
  if (token === DESTINATION_PREFIX_LOG_GROUP_TOKEN) {
    return sanitizeLogGroupName(parts.logGroupName);
  }
  if (token === DESTINATION_PREFIX_YEAR_TOKEN) {
    return parts.year;
  }
  if (token === DESTINATION_PREFIX_MONTH_TOKEN) {
    return parts.month;
  }
  if (token === DESTINATION_PREFIX_DAY_TOKEN) {
    return parts.day;
  }
  return token;
};

/**
 * Renders a destination prefix for one log group and one UTC day.
 *
 * @param template - Prefix template. Defaults are applied by the caller; this function does not.
 * @param parts - Log group name and UTC date segments.
 * @returns Prefix accepted by CreateExportTask.
 * @throws CloudWatchLogsArchiverValidateError when the template or the rendered prefix is illegal.
 */
export const buildDestinationPrefix = (template: string, parts: DestinationPrefixParts): string => {
  assertDestinationPrefixTemplate(template);

  const prefix = template.replace(KNOWN_DESTINATION_PREFIX_TOKEN_PATTERN, (token) =>
    replaceDestinationPrefixToken(token, parts));

  if (prefix.length > MAX_DESTINATION_PREFIX_LENGTH || !DESTINATION_PREFIX_PATTERN.test(prefix)) {
    throw new CloudWatchLogsArchiverValidateError(
      `destinationPrefix for log group ${parts.logGroupName} is not a valid CreateExportTask prefix.`,
    );
  }

  return prefix;
};
