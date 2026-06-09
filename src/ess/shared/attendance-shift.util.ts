const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Gross span in minutes; adds 24h when end <= start (overnight shift). */
export function grossShiftSpanMinutes(startTime: string, endTime: string): number {
  const sm = parseTimeToMinutes(startTime);
  const em = parseTimeToMinutes(endTime);
  if (sm == null || em == null) return 0;
  let span = em - sm;
  if (span <= 0) span += 24 * 60;
  return span;
}

export function buildLocalDateTime(workDate: string, timeStr: string): Date | null {
  const mins = parseTimeToMinutes(timeStr);
  if (mins == null) return null;
  const [y, m, d] = workDate.split('-').map((p) => Number(p));
  const h = Math.floor(mins / 60);
  const min = mins % 60;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

export function overlapMinutes(
  rangeStart: Date,
  rangeEnd: Date,
  windowStart: Date,
  windowEnd: Date,
): number {
  const start = Math.max(rangeStart.getTime(), windowStart.getTime());
  const end = Math.min(rangeEnd.getTime(), windowEnd.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 60000);
}

export function isRestDay(workDate: string, workingDays?: string[] | null): boolean {
  if (!workingDays || workingDays.length === 0) {
    const d = new Date(`${workDate}T12:00:00.000Z`);
    const dow = d.getUTCDay();
    return dow === 0 || dow === 6;
  }
  const d = new Date(`${workDate}T12:00:00.000Z`);
  const label = DAY_NAMES[d.getUTCDay()];
  return !workingDays.includes(label);
}

export function dayOfWeekShort(workDate: string): string {
  const d = new Date(`${workDate}T12:00:00.000Z`);
  return DAY_NAMES[d.getUTCDay()] ?? '';
}

export function formatLateEarlyMinutes(minutes: number): string {
  if (minutes <= 0) return '-';
  return formatMinutesAsHhMm(minutes);
}

export function formatMinutesAsHhMm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatProcessedAt(date: Date): string {
  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${day}${suffix} ${months[date.getMonth()]} at ${h}:${min}`;
}

export function formatSwipeTime(value: Date): string {
  const h = value.getHours();
  const m = String(value.getMinutes()).padStart(2, '0');
  const s = String(value.getSeconds()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m}:${s} ${ampm}`;
}

export function formatSwipeDate(value: Date): string {
  const day = value.getDate();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${String(day).padStart(2, '0')} ${months[value.getMonth()]} ${value.getFullYear()}`;
}

export function matchShiftByName(
  shiftName: string | null | undefined,
  shifts: { name: string }[],
): { name: string } | null {
  const v = String(shiftName ?? '').trim();
  if (!v) return null;
  const exact = shifts.find((s) => String(s.name).trim() === v);
  if (exact) return exact;
  const lower = v.toLowerCase();
  return shifts.find((s) => String(s.name).trim().toLowerCase() === lower) ?? null;
}

export type PunchPair = { in: Date; out?: Date };

export function resolveShiftEndDate(
  shiftStart: Date | null,
  shiftEnd: Date | null,
): Date | null {
  if (!shiftStart || !shiftEnd) return null;
  if (shiftEnd.getTime() <= shiftStart.getTime()) {
    return new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  return shiftEnd;
}

/** Minutes after shift start (display always; grace does not reduce). */
export function calcLateInMinutes(
  firstIn: Date | null,
  shiftStart: Date | null,
): number {
  if (!firstIn || !shiftStart) return 0;
  if (firstIn.getTime() <= shiftStart.getTime()) return 0;
  return Math.round((firstIn.getTime() - shiftStart.getTime()) / 60000);
}

/** Minutes before shift end (display always; grace does not reduce). */
export function calcEarlyOutMinutes(
  lastOut: Date | null,
  shiftEnd: Date | null,
): number {
  if (!lastOut || !shiftEnd) return 0;
  if (lastOut.getTime() >= shiftEnd.getTime()) return 0;
  return Math.round((shiftEnd.getTime() - lastOut.getTime()) / 60000);
}

/** Sum of punch intervals clipped to the shift window. Open pairs use `now`. */
export function calcWorkInShiftMinutes(
  pairs: PunchPair[],
  shiftStart: Date | null,
  shiftEndDate: Date | null,
  now: Date = new Date(),
): number {
  if (!shiftStart || !shiftEndDate) return 0;
  let minutes = 0;
  for (const pair of pairs) {
    const rangeEnd = pair.out ?? now;
    minutes += overlapMinutes(pair.in, rangeEnd, shiftStart, shiftEndDate);
  }
  return minutes;
}

export function calcShortfallAndExcess(
  expectedNetMinutes: number,
  workInShiftMinutes: number,
  actualWorkMinutes: number,
): { shortfallMinutes: number; excessMinutes: number } {
  return {
    shortfallMinutes: Math.max(0, expectedNetMinutes - workInShiftMinutes),
    excessMinutes: Math.max(0, actualWorkMinutes - workInShiftMinutes),
  };
}

export function shouldFlagAttendanceException(params: {
  rest: boolean;
  absent: boolean;
  lastOut: Date | null;
  lateInMinutes: number;
  earlyOutMinutes: number;
  shortfallMinutes: number;
  graceMinutes: number;
}): boolean {
  const {
    rest,
    absent,
    lastOut,
    lateInMinutes,
    earlyOutMinutes,
    shortfallMinutes,
    graceMinutes,
  } = params;
  if (rest) return false;
  if (absent) return true;
  if (!lastOut) return true;
  if (lateInMinutes > graceMinutes) return true;
  if (earlyOutMinutes > graceMinutes) return true;
  if (shortfallMinutes > 0) return true;
  return false;
}
