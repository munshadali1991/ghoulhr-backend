import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { EssAttendanceService } from '../ess/attendance/ess-attendance.service';
import { AttendancePunch } from '../ess/entities/attendance-punch.entity';
import { OrganizationSetting } from '../settings/entities/organization-setting.entity';
import {
  DEFAULT_BIOMETRIC_DEDUPE_WINDOW_SECONDS,
  SETTING_KEYS,
  VALID_PUNCH_DIRECTION_MODES,
} from '../settings/settings.constants';
import { BiometricAuditLog } from './entities/biometric-audit-log.entity';
import {
  BiometricUnmappedPunch,
  BiometricUnmappedStatus,
} from './entities/biometric-unmapped-punch.entity';
import { buildExternalEventKey } from './adapters/zkteco-adms.parser';
import {
  AssignBiometricIdDto,
  ResolveUnmappedPunchDto,
} from './dto/biometric-admin.dto';

@Injectable()
export class BiometricMappingService {
  constructor(private readonly attendanceService: EssAttendanceService) {}

  async listMappings(
    dataSource: DataSource,
    organizationId: string,
    q?: string,
  ) {
    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .where('e.organizationId = :organizationId', { organizationId })
      .andWhere('e.deletedAt IS NULL')
      .andWhere('e.biometricId IS NOT NULL')
      .orderBy('e.biometricId', 'ASC');

    if (q?.trim()) {
      qb.andWhere(
        '(e.name ILIKE :q OR e.employeeCode ILIKE :q OR CAST(e.biometricId AS text) ILIKE :q)',
        { q: `%${q.trim()}%` },
      );
    }

    const rows = await qb.getMany();
    return rows.map((e) => ({
      employeeId: e.id,
      name: e.name,
      employeeCode: e.employeeCode,
      biometricId: e.biometricId,
      status: e.status,
    }));
  }

  async assignBiometricId(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    dto: AssignBiometricIdDto,
    actorEmployeeId?: string,
  ) {
    const empRepo = dataSource.getRepository(Employee);
    const employee = await empRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    let biometricId = dto.biometricId;
    if (biometricId == null) {
      biometricId = await this.nextBiometricId(dataSource, organizationId);
    }
    if (!Number.isInteger(biometricId) || biometricId <= 0) {
      throw new BadRequestException('biometricId must be a positive integer');
    }

    const clash = await empRepo.findOne({
      where: { organizationId, biometricId },
    });
    if (clash && clash.id !== employeeId) {
      throw new ConflictException(
        `biometricId ${biometricId} is already assigned to ${clash.employeeCode}`,
      );
    }

    const before = { biometricId: employee.biometricId };
    employee.biometricId = biometricId;
    await empRepo.save(employee);

    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'MAP_BIOMETRIC_ID',
      employeeId,
      before,
      { biometricId },
      dto.reason,
    );

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      biometricId: employee.biometricId,
    };
  }

  async clearBiometricId(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    actorEmployeeId?: string,
    reason?: string,
  ) {
    const empRepo = dataSource.getRepository(Employee);
    const employee = await empRepo.findOne({
      where: { id: employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const before = { biometricId: employee.biometricId };
    employee.biometricId = null;
    await empRepo.save(employee);
    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'CLEAR_BIOMETRIC_ID',
      employeeId,
      before,
      { biometricId: null },
      reason,
    );
    return { employeeId, biometricId: null };
  }

  async nextBiometricId(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<number> {
    const raw = await dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .select('MAX(e.biometricId)', 'max')
      .where('e.organizationId = :organizationId', { organizationId })
      .andWhere('e.deletedAt IS NULL')
      .getRawOne<{ max: string | null }>();
    const max = raw?.max != null ? Number(raw.max) : 0;
    return (Number.isFinite(max) ? max : 0) + 1;
  }

  async listUnmapped(
    dataSource: DataSource,
    organizationId: string,
    status: string = BiometricUnmappedStatus.OPEN,
  ) {
    const rows = await dataSource.getRepository(BiometricUnmappedPunch).find({
      where: { organizationId, status },
      relations: ['device'],
      order: { eventTimestamp: 'DESC' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.deviceId,
      deviceName: r.device?.name ?? null,
      serialNumber: r.serialNumber,
      biometricId: r.biometricId,
      eventTimestamp: r.eventTimestamp.toISOString(),
      rawPunchType: r.rawPunchType,
      status: r.status,
      createdAt: r.createdAt?.toISOString?.() ?? r.createdAt,
    }));
  }

  async resolveUnmapped(
    dataSource: DataSource,
    organizationId: string,
    unmappedId: string,
    dto: ResolveUnmappedPunchDto,
    actorEmployeeId?: string,
  ) {
    const repo = dataSource.getRepository(BiometricUnmappedPunch);
    const row = await repo.findOne({
      where: { id: unmappedId, organizationId },
    });
    if (!row) throw new NotFoundException('Unmapped punch not found');
    if (row.status !== BiometricUnmappedStatus.OPEN) {
      throw new BadRequestException('Unmapped punch is already resolved');
    }

    if (dto.action === 'ignore') {
      row.status = BiometricUnmappedStatus.IGNORED;
      row.resolvedAt = new Date();
      row.resolvedByEmployeeId = actorEmployeeId ?? null;
      await repo.save(row);
      await this.audit(
        dataSource,
        organizationId,
        actorEmployeeId,
        'IGNORE_UNMAPPED',
        unmappedId,
        null,
        { biometricId: row.biometricId },
        dto.reason,
      );
      return { status: row.status };
    }

    const employee = await dataSource.getRepository(Employee).findOne({
      where: { id: dto.employeeId, organizationId },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    await this.assignBiometricId(
      dataSource,
      organizationId,
      employee.id,
      { biometricId: row.biometricId, reason: dto.reason },
      actorEmployeeId,
    );

    const openForPin = await repo.find({
      where: {
        organizationId,
        biometricId: row.biometricId,
        status: BiometricUnmappedStatus.OPEN,
      },
      order: { eventTimestamp: 'ASC' },
    });

    const policy = await this.loadPolicy(dataSource);
    let converted = 0;
    for (const item of openForPin) {
      await this.attendanceService.ingestDevicePunch(dataSource, {
        organizationId,
        employeeId: employee.id,
        punchedAt: item.eventTimestamp,
        directionMode: policy.directionMode,
        source: 'BIOMETRIC',
        deviceId: item.deviceId,
        deviceSerial: item.serialNumber,
        hardwareUserId: item.biometricId,
        externalEventKey: buildExternalEventKey({
          deviceSerial: item.serialNumber,
          biometricId: item.biometricId,
          eventTimestamp: item.eventTimestamp,
          rawPunchType: item.rawPunchType,
        }),
        dedupeWindowSeconds: policy.dedupeWindowSeconds,
        rawPunchType: item.rawPunchType,
      });
      item.status = BiometricUnmappedStatus.RESOLVED;
      item.resolvedEmployeeId = employee.id;
      item.resolvedAt = new Date();
      item.resolvedByEmployeeId = actorEmployeeId ?? null;
      await repo.save(item);
      converted += 1;
    }

    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'RESOLVE_UNMAPPED',
      unmappedId,
      { biometricId: row.biometricId },
      { employeeId: employee.id, converted },
      dto.reason,
    );

    return {
      status: BiometricUnmappedStatus.RESOLVED,
      employeeId: employee.id,
      biometricId: row.biometricId,
      converted,
    };
  }

  async listLiveFeed(
    dataSource: DataSource,
    organizationId: string,
    since?: string,
    limit = 50,
  ) {
    const take = Math.min(Math.max(limit, 1), 200);
    const qb = dataSource
      .getRepository(AttendancePunch)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.employee', 'e')
      .where('p.organizationId = :organizationId', { organizationId })
      .andWhere('p.source = :source', { source: 'BIOMETRIC' })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.punchedAt', 'DESC')
      .take(take);

    if (since) {
      const sinceDate = new Date(since);
      if (!Number.isNaN(sinceDate.getTime())) {
        qb.andWhere('p.punchedAt > :since', { since: sinceDate });
      }
    }

    const rows = await qb.getMany();
    return rows.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      name: p.employee?.name ?? 'Employee',
      employeeCode: p.employee?.employeeCode ?? '',
      punchedAt: p.punchedAt.toISOString(),
      punchType: p.punchType,
      deviceSerial: p.deviceSerial,
      deviceId: p.deviceId,
      hardwareUserId: p.hardwareUserId,
      source: p.source,
    }));
  }

  private async loadPolicy(dataSource: DataSource): Promise<{
    directionMode: 'smart_shift' | 'strict';
    dedupeWindowSeconds: number;
  }> {
    const rows = await dataSource.getRepository(OrganizationSetting).find({
      where: {
        key: In([
          SETTING_KEYS.ATTENDANCE_PUNCH_DIRECTION_MODE,
          SETTING_KEYS.ATTENDANCE_BIOMETRIC_DEDUPE_WINDOW_SECONDS,
        ]),
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    let directionMode: 'smart_shift' | 'strict' = 'smart_shift';
    const raw = String(map.get(SETTING_KEYS.ATTENDANCE_PUNCH_DIRECTION_MODE) ?? '')
      .trim()
      .toLowerCase();
    if ((VALID_PUNCH_DIRECTION_MODES as readonly string[]).includes(raw)) {
      directionMode = raw as 'smart_shift' | 'strict';
    }
    const dedupeRaw = Number(
      map.get(SETTING_KEYS.ATTENDANCE_BIOMETRIC_DEDUPE_WINDOW_SECONDS),
    );
    return {
      directionMode,
      dedupeWindowSeconds: Number.isFinite(dedupeRaw)
        ? Math.max(0, dedupeRaw)
        : DEFAULT_BIOMETRIC_DEDUPE_WINDOW_SECONDS,
    };
  }

  private async audit(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string | undefined,
    action: string,
    entityId: string,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null,
    reason?: string,
  ) {
    const repo = dataSource.getRepository(BiometricAuditLog);
    await repo.save(
      repo.create({
        organizationId,
        actorEmployeeId: actorEmployeeId ?? null,
        action,
        entityType: 'biometric_mapping',
        entityId,
        reason: reason ?? null,
        beforeJson,
        afterJson,
      }),
    );
  }
}
