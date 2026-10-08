import { CloudWatchLogsArchiverValidateError } from './cloudwatch-logs-archiver-errors';
import { assertDestinationPrefixTemplate } from './destination-prefix';
import {
  DEFAULT_DESTINATION_PREFIX_TEMPLATE,
  DEFAULT_EXPORT_END_OFFSET_DAYS,
  DEFAULT_EXPORT_SPAN_DAYS,
  MAX_EXPORT_SPAN_DAYS,
  MIN_EXPORT_END_OFFSET_DAYS,
  MIN_EXPORT_SPAN_DAYS,
} from '../../settings/consts';

/** Export window and prefix after defaults are applied. */
export interface ResolvedExportSettings {
  /** UTC calendar days before today that the window ends on. */
  readonly endOffsetDays: number;
  /** Number of UTC calendar days in the window. */
  readonly spanDays: number;
  /** Destination prefix template passed to each CreateExportTask. */
  readonly destinationPrefixTemplate: string;
}

const EXPORT_FIELD_END_OFFSET_DAYS = 'EndOffsetDays';
const EXPORT_FIELD_SPAN_DAYS = 'SpanDays';
const EXPORT_FIELD_DESTINATION_PREFIX_TEMPLATE = 'DestinationPrefixTemplate';

const KNOWN_EXPORT_FIELDS = new Set<string>([
  EXPORT_FIELD_END_OFFSET_DAYS,
  EXPORT_FIELD_SPAN_DAYS,
  EXPORT_FIELD_DESTINATION_PREFIX_TEMPLATE,
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isEndOffsetDays = (value: number): boolean =>
  Number.isInteger(value) && value >= MIN_EXPORT_END_OFFSET_DAYS;

const isSpanDays = (value: number): boolean =>
  Number.isInteger(value) && value >= MIN_EXPORT_SPAN_DAYS && value <= MAX_EXPORT_SPAN_DAYS;

/**
 * Reads an optional integer field and rejects values outside the export-window rules.
 *
 * @param value - Raw scheduler field.
 * @param fieldName - Field path used in the error message.
 * @param isAllowed - Whether a number satisfies the field's range.
 * @param requirement - Sentence fragment appended to the field name.
 * @returns The number, or `undefined` when the field was omitted.
 * @throws CloudWatchLogsArchiverValidateError when the field is present and not an allowed integer.
 */
const readOptionalInteger = (
  value: unknown,
  fieldName: string,
  isAllowed: (candidate: number) => boolean,
  requirement: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && isAllowed(value)) {
    return value;
  }
  throw new CloudWatchLogsArchiverValidateError(`${fieldName} ${requirement}`);
};

/**
 * Reads the optional prefix template.
 *
 * @param value - Raw `DestinationPrefixTemplate` field.
 * @returns The template, or `undefined` when omitted.
 * @throws CloudWatchLogsArchiverValidateError when the field is present and not a valid template.
 */
const readDestinationPrefixTemplate = (value: unknown): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new CloudWatchLogsArchiverValidateError(
      'Params.Export.DestinationPrefixTemplate must be a string.',
    );
  }
  assertDestinationPrefixTemplate(value);
  return value;
};

/**
 * Applies export defaults and checks a scheduler `Params.Export` object.
 * Omitted `Export` keeps the previous UTC day, a one-day span, and the default prefix template.
 *
 * @param raw - `Params.Export` from the scheduler event, or `undefined` when omitted.
 * @returns Settings the handler can pass to the window and prefix builders.
 * @throws CloudWatchLogsArchiverValidateError when `Export` is not an object or a field is invalid.
 */
export const resolveExportSettings = (raw: unknown): ResolvedExportSettings => {
  if (raw === undefined) {
    return {
      endOffsetDays: DEFAULT_EXPORT_END_OFFSET_DAYS,
      spanDays: DEFAULT_EXPORT_SPAN_DAYS,
      destinationPrefixTemplate: DEFAULT_DESTINATION_PREFIX_TEMPLATE,
    };
  }
  if (!isPlainRecord(raw)) {
    throw new CloudWatchLogsArchiverValidateError('Params.Export must be an object.');
  }

  const unsupportedField = Object.keys(raw).find((key) => !KNOWN_EXPORT_FIELDS.has(key));
  if (unsupportedField !== undefined) {
    throw new CloudWatchLogsArchiverValidateError(
      `Params.Export contains unsupported field ${unsupportedField}.`,
    );
  }

  return {
    endOffsetDays: readOptionalInteger(
      raw[EXPORT_FIELD_END_OFFSET_DAYS],
      'Params.Export.EndOffsetDays',
      isEndOffsetDays,
      `must be an integer greater than or equal to ${MIN_EXPORT_END_OFFSET_DAYS}.`,
    ) ?? DEFAULT_EXPORT_END_OFFSET_DAYS,
    spanDays: readOptionalInteger(
      raw[EXPORT_FIELD_SPAN_DAYS],
      'Params.Export.SpanDays',
      isSpanDays,
      `must be an integer from ${MIN_EXPORT_SPAN_DAYS} to ${MAX_EXPORT_SPAN_DAYS}.`,
    ) ?? DEFAULT_EXPORT_SPAN_DAYS,
    destinationPrefixTemplate: readDestinationPrefixTemplate(raw[EXPORT_FIELD_DESTINATION_PREFIX_TEMPLATE])
      ?? DEFAULT_DESTINATION_PREFIX_TEMPLATE,
  };
};
