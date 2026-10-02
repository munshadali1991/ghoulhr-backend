/** Escape a CSV cell and neutralize formula injection. */
export function csvEscape(value: string): string {
  let v = value ?? '';
  if (/^[=+\-@]/.test(v)) {
    v = `'${v}`;
  }
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Normalize money to 2 decimal places; reject invalid / over-precision. */
export function normalizeMoneyAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error('Invalid amount');
  }
  if (
    String(value).includes('.') &&
    (String(value).split('.')[1] || '').length > 2
  ) {
    throw new Error('Amount can have at most 2 decimal places');
  }
  return (Math.round(n * 100) / 100).toFixed(2);
}
