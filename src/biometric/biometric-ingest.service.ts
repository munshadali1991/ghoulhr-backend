import {
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { DataSource, In } from 'typeorm';
import {
  Employee,
  EmployeeStatus,
} from '../employees/employee.entity';
import { OrganizationSetting } from '../settings/entities/organization-setting.entity';
import {
  DEFAULT_BIOMETRIC_DEDUPE_WINDOW_SECONDS,
  SETTING_KEYS,
  VALID_PUNCH_DIRECTION_MODES,
} from '../settings/settings.constants';
import { EssAttendanceService } from '../ess/attendance/ess-attendance.service';
import { buildOrgWallClockDate } from '../common/utils/org-timezone.util';
import {
  BiometricDevice,
  BiometricDeviceStatus,
} from './entities/biometric-device.entity';
import {
  BiometricUnmappedPunch,
  BiometricUnmappedStatus,
} from './entities/biometric-unmapped-punch.entity';
import { NormalizedBiometricEvent } from './adapters/biometric-adapter.interface';
import {
  buildExternalEventKey,
  parseZktecoAdmsPayload,
} from './adapters/zkteco-adms.parser';

@Injectable()
export class BiometricIngestService {
  private readonly logger = new Logger(BiometricIngestService.name);

  constructor(private readonly attendanceService: EssAttendanceService) {}

  /**
   * Handle ZKTeco /iclock/cdata push. Always prefers HTTP 200 "OK" for valid
   * registered devices so firmware clears its offline buffer.
   */
  async handleZktecoCdata(
    dataSource: DataSource,
    organizationId: string,
    query: Record<string, unknown>,
    headers: Record<string, unknown>,
    body: unknown,
  ): Promise<{ statusCode: number; body: string }> {
    const parsed = parseZktecoAdmsPayload({ query, headers, body });
    const serial = parsed.deviceSerial?.trim();
    if (!serial) {
      this.logger.warn('ADMS request missing device serial');
      return { statusCode: 400, body: 'Invalid SN' };
    }

    const device = await dataSource.getRepository(BiometricDevice).findOne({
      where: { organizationId, serialNumber: serial },
    });

    if (!device || device.status !== BiometricDeviceStatus.ACTIVE) {
      this.logger.warn(`Rejected ADMS push from unregistered/inactive SN=${serial}`);
      return { statusCode: 403, body: 'Unauthorized' };
    }

    if (device.commKeyHash) {
      const provided = extractCommKey(query, headers);
      if (!provided || !safeHashEquals(hashCommKey(provided), device.commKeyHash)) {
        return { statusCode: 403, body: 'Unauthorized' };
      }
    }

    await dataSource.getRepository(BiometricDevice).update(device.id, {
      lastSeenAt: new Date(),
    });

    if (parsed.isHeartbeat || parsed.events.length === 0) {
      return { statusCode: 200, body: 'OK' };
    }

    const policy = await this.loadBiometricPolicy(dataSource);
    const timezone = device.timezone?.trim() || policy.timezone;

    for (const event of parsed.events) {
      try {
        await this.processEvent(dataSource, organizationId, device, event, {
          ...policy,
          timezone,
        });
      } catch (err) {
        this.logger.error(
          `Failed processing ADMS event SN=${serial} PIN=${event.biometricId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
        // Still ACK so device does not infinite-retry a poison message
      }
    }

    return { statusCode: 200, body: 'OK' };
  }

  private async processEvent(
    dataSource: DataSource,
    organizationId: string,
    device: BiometricDevice,
    event: NormalizedBiometricEvent,
    policy: {
      timezone: string;
      directionMode: 'smart_shift' | 'strict';
      dedupeWindowSeconds: number;
    },
  ): Promise<void> {
    const punchedAt = wallClockUtcComponentsToOrgInstant(
      event.eventTimestamp,
      policy.timezone,
    );

    const employee = await dataSource.getRepository(Employee).findOne({
      where: {
        organizationId,
        biometricId: event.biometricId,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (!employee) {
      await this.queueUnmapped(dataSource, organizationId, device, event, punchedAt);
      return;
    }

    await this.attendanceService.ingestDevicePunch(dataSource, {
      organizationId,
      employeeId: employee.id,
      punchedAt,
      directionMode: policy.directionMode,
      source: 'BIOMETRIC',
      deviceId: device.id,
      deviceSerial: device.serialNumber,
      hardwareUserId: event.biometricId,
      externalEventKey: buildExternalEventKey({
        ...event,
        deviceSerial: device.serialNumber,
        eventTimestamp: punchedAt,
      }),
      dedupeWindowSeconds: policy.dedupeWindowSeconds,
      rawPunchType: event.rawPunchType,
    });
  }

  private async queueUnmapped(
    dataSource: DataSource,
    organizationId: string,
    device: BiometricDevice,
    event: NormalizedBiometricEvent,
    punchedAt: Date,
  ): Promise<void> {
    const repo = dataSource.getRepository(BiometricUnmappedPunch);
    const existing = await repo.findOne({
      where: {
        organizationId,
        serialNumber: device.serialNumber,
        biometricId: event.biometricId,
        eventTimestamp: punchedAt,
        status: BiometricUnmappedStatus.OPEN,
      },
    });
    if (existing) return;

    await repo.save(
      repo.create({
        organizationId,
        deviceId: device.id,
        serialNumber: device.serialNumber,
        biometricId: event.biometricId,
        eventTimestamp: punchedAt,
        rawPunchType: event.rawPunchType ?? null,
        rawPayload: event.rawPayload ?? null,
        status: BiometricUnmappedStatus.OPEN,
      }),
    );
  }

  private async loadBiometricPolicy(dataSource: DataSource): Promise<{
    timezone: string;
    directionMode: 'smart_shift' | 'strict';
    dedupeWindowSeconds: number;
  }> {
    const rows = await dataSource.getRepository(OrganizationSetting).find({
      where: {
        key: In([
          SETTING_KEYS.ORG_TIMEZONE,
          SETTING_KEYS.ATTENDANCE_PUNCH_DIRECTION_MODE,
          SETTING_KEYS.ATTENDANCE_BIOMETRIC_DEDUPE_WINDOW_SECONDS,
        ]),
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));

    let directionMode: 'smart_shift' | 'strict' = 'smart_shift';
    const rawMode = String(map.get(SETTING_KEYS.ATTENDANCE_PUNCH_DIRECTION_MODE) ?? '')
      .trim()
      .toLowerCase();
    if ((VALID_PUNCH_DIRECTION_MODES as readonly string[]).includes(rawMode)) {
      directionMode = rawMode as 'smart_shift' | 'strict';
    }

    const dedupeRaw = Number(
      map.get(SETTING_KEYS.ATTENDANCE_BIOMETRIC_DEDUPE_WINDOW_SECONDS),
    );
    const dedupeWindowSeconds = Number.isFinite(dedupeRaw)
      ? Math.max(0, dedupeRaw)
      : DEFAULT_BIOMETRIC_DEDUPE_WINDOW_SECONDS;

    const timezone =
      String(map.get(SETTING_KEYS.ORG_TIMEZONE) ?? '').trim() || 'Asia/Kolkata';

    return { timezone, directionMode, dedupeWindowSeconds };
  }
}

/** Parser stores wall-clock digits via Date.UTC(y,m,d,h,mi,s); convert to real instant. */
export function wallClockUtcComponentsToOrgInstant(
  wallAsUtc: Date,
  timezone: string,
): Date {
  const y = wallAsUtc.getUTCFullYear();
  const mo = wallAsUtc.getUTCMonth() + 1;
  const d = wallAsUtc.getUTCDate();
  const h = wallAsUtc.getUTCHours();
  const mi = wallAsUtc.getUTCMinutes();
  const workDate = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const timeStr = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  return buildOrgWallClockDate(workDate, timeStr, timezone) ?? wallAsUtc;
}

export function hashCommKey(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

function extractCommKey(
  query: Record<string, unknown>,
  headers: Record<string, unknown>,
): string | null {
  const q = query.CommKey ?? query.commKey ?? query.Key;
  if (q != null && String(q).trim()) return String(q).trim();
  const found = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'x-comm-key' || k.toLowerCase() === 'commkey',
  );
  return found?.[1] != null ? String(found[1]).trim() : null;
}

function safeHashEquals(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Assert tenant context is present for ADMS routes. */
export function requireTenantContext(
  organizationId?: string,
  dataSource?: DataSource,
): asserts organizationId is string {
  if (!organizationId || !dataSource) {
    throw new BadRequestException(
      'Tenant context required. Configure the device Cloud Server URL with the organization subdomain or port.',
    );
  }
}

export function assertDeviceActive(device: BiometricDevice | null): BiometricDevice {
  if (!device || device.status !== BiometricDeviceStatus.ACTIVE) {
    throw new ForbiddenException('Device is not registered or not active');
  }
  return device;
}
