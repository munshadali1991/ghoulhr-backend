import { leaveRangesConflict, sessionsCoveredOnDay } from './leave-request-query.util';

describe('sessionsCoveredOnDay', () => {
  it('covers a single half-day session', () => {
    expect(
      [...sessionsCoveredOnDay('2026-03-10', '2026-03-10', 'Session 1', 'Session 1', '2026-03-10')],
    ).toEqual([1]);
    expect(
      [...sessionsCoveredOnDay('2026-03-10', '2026-03-10', 'Session 2', 'Session 2', '2026-03-10')],
    ).toEqual([2]);
  });

  it('covers both sessions for a full same-day leave', () => {
    expect(
      [...sessionsCoveredOnDay('2026-03-10', '2026-03-10', 'Session 1', 'Session 2', '2026-03-10')].sort(),
    ).toEqual([1, 2]);
  });
});

describe('leaveRangesConflict', () => {
  it('detects overlapping full-day requests', () => {
    expect(
      leaveRangesConflict(
        {
          startDate: '2026-03-10',
          endDate: '2026-03-12',
          startSession: 'Session 1',
          endSession: 'Session 2',
        },
        {
          startDate: '2026-03-11',
          endDate: '2026-03-11',
          startSession: 'Session 1',
          endSession: 'Session 2',
        },
      ),
    ).toBe(true);
  });

  it('allows morning + afternoon half-days on the same date', () => {
    expect(
      leaveRangesConflict(
        {
          startDate: '2026-03-10',
          endDate: '2026-03-10',
          startSession: 'Session 1',
          endSession: 'Session 1',
        },
        {
          startDate: '2026-03-10',
          endDate: '2026-03-10',
          startSession: 'Session 2',
          endSession: 'Session 2',
        },
      ),
    ).toBe(false);
  });

  it('blocks identical half-day session twice', () => {
    expect(
      leaveRangesConflict(
        {
          startDate: '2026-03-10',
          endDate: '2026-03-10',
          startSession: 'Session 1',
          endSession: 'Session 1',
        },
        {
          startDate: '2026-03-10',
          endDate: '2026-03-10',
          startSession: 'Session 1',
          endSession: 'Session 1',
        },
      ),
    ).toBe(true);
  });
});
