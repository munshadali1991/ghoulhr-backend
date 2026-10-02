import { addCalendarDays } from '../../common/utils/org-timezone.util';
import { parseTimeToMinutes } from '../shared/attendance-shift.util';

export const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isFutureWorkDate(workDate: string, todayKey: string): boolean {
  return workDate > todayKey;
}

export function resolveRegularizationOutDate(
  workDate: string,
  inTime: string,
  outTime: string,
  overnightShift: boolean,
): { outDate: string } | { error: 'invalid_time' | 'out_before_in' } {
  if (!HH_MM_PATTERN.test(inTime) || !HH_MM_PATTERN.test(outTime)) {
    return { error: 'invalid_time' };
  }
  const inMinutes = parseTimeToMinutes(inTime);
  const outMinutes = parseTimeToMinutes(outTime);
  if (inMinutes == null || outMinutes == null) {
    return { error: 'invalid_time' };
  }
  if (outMinutes > inMinutes) {
    return { outDate: workDate };
  }
  if (overnightShift) {
    return { outDate: addCalendarDays(workDate, 1) };
  }
  return { error: 'out_before_in' };
}
