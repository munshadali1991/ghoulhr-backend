const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function formatDayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  return DAY_NAMES[d.getUTCDay()] ?? '';
}

export function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = d.getUTCDate();
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatHomeDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const day = DAY_NAMES[d.getUTCDay()];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day}, ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatTimeOrDash(value?: Date | null): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function formatMinutesAsHhMm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function isWeekend(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
