import {
  isOvernightShift,
  pairPunches,
  resolveShiftEndDate,
} from './attendance-shift.util';

describe('isOvernightShift', () => {
  it('detects night shifts that cross midnight', () => {
    expect(isOvernightShift('22:00', '06:00')).toBe(true);
    expect(isOvernightShift('09:00', '18:00')).toBe(false);
    expect(isOvernightShift('00:00', '00:00')).toBe(true);
  });
});

describe('pairPunches', () => {
  it('pairs multiple IN/OUT cycles and keeps an open trailing IN', () => {
    const t1 = new Date('2026-03-10T09:00:00Z');
    const t2 = new Date('2026-03-10T12:00:00Z');
    const t3 = new Date('2026-03-10T13:00:00Z');
    const t4 = new Date('2026-03-10T18:00:00Z');
    const t5 = new Date('2026-03-10T19:00:00Z');

    const pairs = pairPunches([
      { punchedAt: t1, punchType: 'IN' },
      { punchedAt: t2, punchType: 'OUT' },
      { punchedAt: t3, punchType: 'IN' },
      { punchedAt: t4, punchType: 'OUT' },
      { punchedAt: t5, punchType: 'IN' },
    ]);

    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toEqual({ in: t1, out: t2 });
    expect(pairs[1]).toEqual({ in: t3, out: t4 });
    expect(pairs[2]).toEqual({ in: t5 });
  });

  it('filters overnight pairs to the work date of the IN punch', () => {
    const inPunch = new Date('2026-03-10T16:30:00Z'); // 22:00 IST
    const outPunch = new Date('2026-03-11T00:30:00Z'); // 06:00 IST
    const nextIn = new Date('2026-03-11T16:30:00Z');

    const pairs = pairPunches(
      [
        { punchedAt: inPunch, punchType: 'IN' },
        { punchedAt: outPunch, punchType: 'OUT' },
        { punchedAt: nextIn, punchType: 'IN' },
      ],
      {
        workDateKey: '2026-03-10',
        dateKeyForInstant: (d) => d.toISOString().slice(0, 10),
      },
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ in: inPunch, out: outPunch });
  });
});

describe('resolveShiftEndDate', () => {
  it('rolls overnight end into the next calendar day', () => {
    const start = new Date(2026, 2, 10, 22, 0, 0, 0);
    const end = new Date(2026, 2, 10, 6, 0, 0, 0);
    const resolved = resolveShiftEndDate(start, end);
    expect(resolved?.getDate()).toBe(11);
    expect(resolved?.getHours()).toBe(6);
  });
});
