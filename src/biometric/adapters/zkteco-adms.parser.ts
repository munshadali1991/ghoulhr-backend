import { BiometricAdapterParseResult, NormalizedBiometricEvent } from './biometric-adapter.interface';

/**
 * ZKTeco / eSSL ADMS ATTLOG parser.
 * Typical line: PIN\tTIME\tSTATUS\tVERIFY\tWORKCODE\tRESERVE1\tRESERVE2
 * TIME format: YYYY-MM-DD HH:mm:ss (device local / NTP).
 */
export function parseZktecoAdmsPayload(input: {
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: unknown;
}): BiometricAdapterParseResult {
  const deviceSerial = extractSerial(input.query, input.headers);
  const rawText = bodyToText(input.body);
  const table = String(input.query.table ?? input.query.Table ?? '').toUpperCase();

  if (!rawText.trim()) {
    return {
      events: [],
      deviceSerial,
      isHeartbeat: true,
    };
  }

  // Non-ATTLOG posts (OPERLOG, etc.) — acknowledge without creating punches
  if (table && table !== 'ATTLOG' && !looksLikeAttlog(rawText)) {
    return {
      events: [],
      deviceSerial,
      isHeartbeat: true,
    };
  }

  const events: NormalizedBiometricEvent[] = [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const parsed = parseAttlogLine(line, deviceSerial);
    if (parsed) events.push(parsed);
  }

  return {
    events,
    deviceSerial,
    isHeartbeat: events.length === 0,
  };
}

function extractSerial(
  query: Record<string, unknown>,
  headers: Record<string, unknown>,
): string | null {
  const fromQuery =
    query.SN ?? query.sn ?? query.SerialNumber ?? query.serialNumber;
  if (fromQuery != null && String(fromQuery).trim()) {
    return String(fromQuery).trim();
  }
  const headerKeys = ['sn', 'x-device-sn', 'x-zk-sn'];
  for (const key of headerKeys) {
    const found = Object.entries(headers).find(
      ([k]) => k.toLowerCase() === key,
    );
    if (found?.[1] != null && String(found[1]).trim()) {
      return String(found[1]).trim();
    }
  }
  return null;
}

function bodyToText(body: unknown): string {
  if (body == null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (typeof rec.data === 'string') return rec.data;
    if (typeof rec.body === 'string') return rec.body;
    // URL-encoded form may put ATTLOG under various keys
    for (const v of Object.values(rec)) {
      if (typeof v === 'string' && (v.includes('\t') || /\d{4}-\d{2}-\d{2}/.test(v))) {
        return v;
      }
    }
    return JSON.stringify(body);
  }
  return String(body);
}

function looksLikeAttlog(text: string): boolean {
  return /\d+\t\d{4}-\d{2}-\d{2}/.test(text) || /^\d+\s+\d{4}-\d{2}-\d{2}/m.test(text);
}

function parseAttlogLine(
  line: string,
  deviceSerial: string | null,
): NormalizedBiometricEvent | null {
  const parts = line.includes('\t') ? line.split('\t') : line.split(/\s+/);
  if (parts.length < 2) return null;

  const pin = Number.parseInt(parts[0], 10);
  if (!Number.isFinite(pin) || pin <= 0) return null;

  const timeRaw = parts[1]?.trim();
  const eventTimestamp = parseDeviceTimestamp(timeRaw);
  if (!eventTimestamp) return null;

  const rawPunchType = parts[2]?.trim() ?? null;

  return {
    deviceSerial: deviceSerial ?? '',
    biometricId: pin,
    eventTimestamp,
    rawPunchType,
    rawPayload: line,
  };
}

/** Parse device wall-clock as UTC-naive ISO (treat as absolute instant without TZ shift). */
function parseDeviceTimestamp(raw?: string): Date | null {
  if (!raw) return null;
  const normalized = raw.replace(' ', 'T');
  // Prefer appending Z only when no offset — devices send local NTP time;
  // we store as timestamptz by interpreting the string in UTC components
  // matching how most ADMS deployments treat device clocks as org-local.
  const m = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h, mi, s] = m;
  // Construct Date from components as UTC so punchedAt matches the device
  // digits; org timezone formatting later treats wall clock via org TZ policy
  // when pairing with shifts that use orgDateKeyForInstant.
  return new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    ),
  );
}

export function buildExternalEventKey(event: NormalizedBiometricEvent): string {
  const ts = event.eventTimestamp.toISOString();
  const type = event.rawPunchType ?? '';
  return `zk:${event.deviceSerial}:${event.biometricId}:${ts}:${type}`;
}
