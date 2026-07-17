import { isLimitExceededException } from '../../src/funcs/core/is-limit-exceeded-exception';

describe('isLimitExceededException', () => {
  it.each([
    {
      name: 'Error with LimitExceededException name',
      error: Object.assign(new Error('Too many export tasks'), { name: 'LimitExceededException' }),
      expected: true,
    },
    {
      name: 'plain object with LimitExceededException name',
      error: { name: 'LimitExceededException', message: 'quota' },
      expected: true,
    },
    {
      name: 'different exception name',
      error: Object.assign(new Error('missing'), { name: 'ResourceNotFoundException' }),
      expected: false,
    },
    {
      name: 'Error without name override',
      error: new Error('generic'),
      expected: false,
    },
    {
      name: 'null',
      error: null,
      expected: false,
    },
    {
      name: 'undefined',
      error: undefined,
      expected: false,
    },
    {
      name: 'string',
      error: 'LimitExceededException',
      expected: false,
    },
    {
      name: 'object without name',
      error: { message: 'LimitExceededException' },
      expected: false,
    },
  ])('$name', ({ error, expected }) => {
    expect(isLimitExceededException(error)).toBe(expected);
  });
});
