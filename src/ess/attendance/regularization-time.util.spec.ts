import {
  isFutureWorkDate,
  resolveRegularizationOutDate,
} from './regularization-time.util';

describe('isFutureWorkDate', () => {
  it('rejects dates after today', () => {
    expect(isFutureWorkDate('2026-08-02', '2026-08-01')).toBe(true);
    expect(isFutureWorkDate('2026-08-01', '2026-08-01')).toBe(false);
    expect(isFutureWorkDate('2026-07-31', '2026-08-01')).toBe(false);
  });
});

describe('resolveRegularizationOutDate', () => {
  it('keeps out on the same day when out is after in', () => {
    expect(
      resolveRegularizationOutDate('2026-08-01', '09:00', '18:00', false),
    ).toEqual({ outDate: '2026-08-01' });
  });

  it('rejects out before in on a daytime shift', () => {
    expect(
      resolveRegularizationOutDate('2026-08-01', '09:00', '08:00', false),
    ).toEqual({ error: 'out_before_in' });
  });

  it('rolls out to the next day on an overnight shift', () => {
    expect(
      resolveRegularizationOutDate('2026-08-01', '22:00', '06:00', true),
    ).toEqual({ outDate: '2026-08-02' });
  });

  it('rejects invalid times', () => {
    expect(
      resolveRegularizationOutDate('2026-08-01', '25:00', '18:00', false),
    ).toEqual({ error: 'invalid_time' });
  });
});
