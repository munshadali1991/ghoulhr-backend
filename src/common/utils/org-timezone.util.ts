const DEFAULT_TIMEZONE = 'Asia/Kolkata';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Normalize org profile timezone; falls back to Asia/Kolkata when unset or invalid. */
export function resolveOrgTimezone(timezone?: string | null): string {
  const value = String(timezone ?? '').trim();
  if (!value) return DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** Day-of-week (0=Sun) for a civil calendar date in the org timezone. */
export function weekdayForOrgDate(dateKey: string, timezone: string): number {
  const tz = resolveOrgTimezone(timezone);
  const utc = new Date(`${dateKey}T12:00:00.000Z`);
  const label = utc.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
  return WEEKDAY_MAP[label] ?? utc.getUTCDay();
}

export function isWeekendForOrgDate(
  dateKey: string,
  timezone: string,
): boolean {
  const dow = weekdayForOrgDate(dateKey, timezone);
  return dow === 0 || dow === 6;
}

export function addCalendarDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Civil date (YYYY-MM-DD) for an instant in the org timezone. */
export function orgDateKeyForInstant(instant: Date, timezone?: string | null): string {
  const tz = resolveOrgTimezone(timezone);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

function parseHm(timeStr: string): { h: number; m: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { h, m };
}

function timezoneOffsetMs(timeZone: string, date: Date): number {
  const utcMs = date.getTime();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/** UTC instant for civil workDate + HH:mm interpreted in org timezone. */
export function buildOrgWallClockDate(
  workDate: string,
  timeStr: string,
  timezone?: string | null,
): Date | null {
  const tz = resolveOrgTimezone(timezone);
  const hm = parseHm(timeStr);
  if (!hm) return null;
  const y = Number(workDate.slice(0, 4));
  const mo = Number(workDate.slice(5, 7));
  const d = Number(workDate.slice(8, 10));
  let utcMs = Date.UTC(y, mo - 1, d, hm.h, hm.m, 0);
  for (let i = 0; i < 3; i += 1) {
    utcMs = Date.UTC(y, mo - 1, d, hm.h, hm.m, 0) - timezoneOffsetMs(tz, new Date(utcMs));
  }
  return new Date(utcMs);
}

/** Inclusive org-local day bounds for punch queries. */
export function orgDayBounds(
  workDate: string,
  timezone?: string | null,
): { start: Date; end: Date } {
  const start = buildOrgWallClockDate(workDate, '00:00', timezone)!;
  const nextDay = addCalendarDays(workDate, 1);
  const nextStart = buildOrgWallClockDate(nextDay, '00:00', timezone)!;
  return { start, end: new Date(nextStart.getTime() - 1) };
}

export function formatTimeInOrg(
  value: Date | null | undefined,
  timezone?: string | null,
): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  const tz = resolveOrgTimezone(timezone);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatDateInOrg(
  value: Date,
  timezone?: string | null,
): string {
  const tz = resolveOrgTimezone(timezone);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}`.trim();
}

export function eachCalendarDayInRange(
  fromDate: string,
  toDate: string,
): string[] {
  const keys: string[] = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    keys.push(cursor);
    cursor = addCalendarDays(cursor, 1);
  }
  return keys;
}
