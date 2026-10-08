import { listUtcExportWindows } from '../../src/funcs/core/export-window';

describe('listUtcExportWindows', () => {
  it.each([
    {
      name: 'default previous UTC day',
      nowIso: '2026-07-17T13:01:00.000Z',
      endOffsetDays: 1,
      spanDays: 1,
      expected: [
        {
          fromIso: '2026-07-16T00:00:00.000Z',
          toIso: '2026-07-16T23:59:59.999Z',
          year: '2026',
          month: '07',
          day: '16',
        },
      ],
    },
    {
      name: 'end offset 2 is the day before yesterday',
      nowIso: '2026-03-01T00:00:00.000Z',
      endOffsetDays: 2,
      spanDays: 1,
      expected: [
        {
          fromIso: '2026-02-27T00:00:00.000Z',
          toIso: '2026-02-27T23:59:59.999Z',
          year: '2026',
          month: '02',
          day: '27',
        },
      ],
    },
    {
      name: 'span of 3 ending yesterday crosses a month boundary, oldest first',
      nowIso: '2026-03-01T13:01:00.000Z',
      endOffsetDays: 1,
      spanDays: 3,
      expected: [
        {
          fromIso: '2026-02-26T00:00:00.000Z',
          toIso: '2026-02-26T23:59:59.999Z',
          year: '2026',
          month: '02',
          day: '26',
        },
        {
          fromIso: '2026-02-27T00:00:00.000Z',
          toIso: '2026-02-27T23:59:59.999Z',
          year: '2026',
          month: '02',
          day: '27',
        },
        {
          fromIso: '2026-02-28T00:00:00.000Z',
          toIso: '2026-02-28T23:59:59.999Z',
          year: '2026',
          month: '02',
          day: '28',
        },
      ],
    },
    {
      name: 'span of 3 ending yesterday crosses a year boundary',
      nowIso: '2026-01-02T13:01:00.000Z',
      endOffsetDays: 1,
      spanDays: 3,
      expected: [
        {
          fromIso: '2025-12-30T00:00:00.000Z',
          toIso: '2025-12-30T23:59:59.999Z',
          year: '2025',
          month: '12',
          day: '30',
        },
        {
          fromIso: '2025-12-31T00:00:00.000Z',
          toIso: '2025-12-31T23:59:59.999Z',
          year: '2025',
          month: '12',
          day: '31',
        },
        {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-01T23:59:59.999Z',
          year: '2026',
          month: '01',
          day: '01',
        },
      ],
    },
    {
      name: 'span of 3 includes leap day',
      nowIso: '2024-03-02T08:00:00.000Z',
      endOffsetDays: 1,
      spanDays: 3,
      expected: [
        {
          fromIso: '2024-02-28T00:00:00.000Z',
          toIso: '2024-02-28T23:59:59.999Z',
          year: '2024',
          month: '02',
          day: '28',
        },
        {
          fromIso: '2024-02-29T00:00:00.000Z',
          toIso: '2024-02-29T23:59:59.999Z',
          year: '2024',
          month: '02',
          day: '29',
        },
        {
          fromIso: '2024-03-01T00:00:00.000Z',
          toIso: '2024-03-01T23:59:59.999Z',
          year: '2024',
          month: '03',
          day: '01',
        },
      ],
    },
  ])('$name', ({ nowIso, endOffsetDays, spanDays, expected }) => {
    const windows = listUtcExportWindows(new Date(nowIso), { endOffsetDays, spanDays });

    expect(windows).toEqual(expected.map((day) => ({
      from: Date.parse(day.fromIso),
      to: Date.parse(day.toIso),
      year: day.year,
      month: day.month,
      day: day.day,
    })));
  });
});
