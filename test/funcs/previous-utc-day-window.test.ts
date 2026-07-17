import { getPreviousUtcDayWindow } from '../../src/funcs/core/previous-utc-day-window';

describe('getPreviousUtcDayWindow', () => {
  it.each([
    {
      name: 'mid-month ordinary day',
      nowIso: '2026-07-17T13:01:00.000Z',
      expected: {
        fromIso: '2026-07-16T00:00:00.000Z',
        toIso: '2026-07-16T23:59:59.999Z',
        year: '2026',
        month: '07',
        day: '16',
      },
    },
    {
      name: 'month boundary (1st → previous month)',
      nowIso: '2026-03-01T00:00:00.000Z',
      expected: {
        fromIso: '2026-02-28T00:00:00.000Z',
        toIso: '2026-02-28T23:59:59.999Z',
        year: '2026',
        month: '02',
        day: '28',
      },
    },
    {
      name: 'year boundary',
      nowIso: '2026-01-01T13:01:00.000Z',
      expected: {
        fromIso: '2025-12-31T00:00:00.000Z',
        toIso: '2025-12-31T23:59:59.999Z',
        year: '2025',
        month: '12',
        day: '31',
      },
    },
    {
      name: 'leap day previous (Mar 1 after leap day)',
      nowIso: '2024-03-01T08:00:00.000Z',
      expected: {
        fromIso: '2024-02-29T00:00:00.000Z',
        toIso: '2024-02-29T23:59:59.999Z',
        year: '2024',
        month: '02',
        day: '29',
      },
    },
    {
      name: 'just before UTC midnight still uses calendar previous day',
      nowIso: '2026-07-17T23:59:59.999Z',
      expected: {
        fromIso: '2026-07-16T00:00:00.000Z',
        toIso: '2026-07-16T23:59:59.999Z',
        year: '2026',
        month: '07',
        day: '16',
      },
    },
  ])('$name', ({ nowIso, expected }) => {
    const window = getPreviousUtcDayWindow(new Date(nowIso));

    expect(window.from).toBe(Date.parse(expected.fromIso));
    expect(window.to).toBe(Date.parse(expected.toIso));
    expect(window.year).toBe(expected.year);
    expect(window.month).toBe(expected.month);
    expect(window.day).toBe(expected.day);
  });
});
