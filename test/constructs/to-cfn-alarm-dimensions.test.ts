import { toCfnAlarmDimensions } from '../../src/constructs/to-cfn-alarm-dimensions';

describe('toCfnAlarmDimensions', () => {
  it.each([
    {
      name: 'undefined dimensions',
      dimensions: undefined,
      expected: undefined,
    },
    {
      name: 'empty dimensions',
      dimensions: {},
      expected: undefined,
    },
    {
      name: 'string dimension values',
      dimensions: { FunctionName: 'archive-fn', ScheduleGroup: 'archive-group' },
      expected: [
        { name: 'FunctionName', value: 'archive-fn' },
        { name: 'ScheduleGroup', value: 'archive-group' },
      ],
    },
    {
      name: 'token dimension values',
      dimensions: { FunctionName: { Ref: 'LogArchiveFunction' } },
      expected: [
        { name: 'FunctionName', value: { Ref: 'LogArchiveFunction' } },
      ],
    },
  ])('$name', ({ dimensions, expected }) => {
    expect(toCfnAlarmDimensions(dimensions)).toEqual(expected);
  });
});
