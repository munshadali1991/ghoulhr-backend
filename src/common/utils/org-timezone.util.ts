const DEFAULT_TIMEZONE = 'UTC';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Normalize org profile timezone; falls back to UTC when unset or invalid. */
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
