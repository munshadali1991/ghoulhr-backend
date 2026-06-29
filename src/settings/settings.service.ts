import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { OrganizationSetting } from './entities/organization-setting.entity';
import { WorkShiftConfiguration } from '../employees/entities/work-shift-configuration.entity';
import { WorkShiftSession } from '../employees/entities/work-shift-session.entity';
import {
  CreateSettingDto,
  UpdateOrgProfileDto,
  UpdateEmployeeSettingsDto,
  UpdateAttendanceSettingsDto,
  UpdateDepartmentsDto,
  UpdateDesignationsDto,
  ShiftDto,
} from './dto/create-setting.dto';
import { SETTING_KEYS } from './settings.constants';
import { Department } from '../employees/entities/department.entity';
import { Designation } from '../employees/entities/designation.entity';
import { DesignationDepartment } from '../employees/entities/designation-department.entity';
import { LocationConfiguration } from '../employees/entities/location-configuration.entity';
import { UpdateLocationConfigurationsDto } from './dto/location-configuration.dto';
import { LeaveConfiguration } from './entities/leave-configuration.entity';
import { UpdateLeaveConfigurationsDto } from './dto/leave-configuration.dto';
import { UpdateTimesheetSettingsDto } from './dto/timesheet-settings.dto';
import { DEFAULT_TIMESHEET_SETTINGS } from './timesheet-settings.defaults';
import { StorageService } from '../storage/storage.service';

/** Serialize entity timestamps for JSON responses. */
function toIsoTimestamp(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Read timestamp fields from TypeORM entities or raw SQL rows (mixed casing). */
function readRowTimestamp(
  row: Record<string, unknown>,
  field: 'createdAt' | 'updatedAt',
): string | undefined {
  const snake = field === 'createdAt' ? 'created_at' : 'updated_at';
  const raw =
    row[field] ??
    row[field.toLowerCase()] ??
    row[snake];
  return toIsoTimestamp(raw as Date | string | undefined);
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly storageService: StorageService) {}

  async getSetting(
    key: string,
    dataSource: DataSource,
  ): Promise<OrganizationSetting> {
    const repo = this.getRepository(dataSource);
    const setting = await repo.findOne({ where: { key } });

    if (!setting) {
      throw new NotFoundException(`Setting '${key}' not found`);
    }

    return setting;
  }

  async getAllSettings(dataSource: DataSource): Promise<OrganizationSetting[]> {
    const repo = this.getRepository(dataSource);
    return repo.find({ order: { createdAt: 'ASC' } });
  }

  async setSetting(
    key: string,
    value: any,
    dataSource: DataSource,
  ): Promise<OrganizationSetting> {
    const repo = this.getRepository(dataSource);

    let setting = await repo.findOne({ where: { key } });

    if (setting) {
      setting.value = value;
    } else {
      setting = repo.create({ key, value });
    }

    return repo.save(setting);
  }

  async updateOrgProfile(
    dto: UpdateOrgProfileDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};

    const mapping = {
      name: SETTING_KEYS.ORG_NAME,
      logo: SETTING_KEYS.ORG_LOGO,
      timezone: SETTING_KEYS.ORG_TIMEZONE,
      currency: SETTING_KEYS.ORG_CURRENCY,
      dateFormat: SETTING_KEYS.ORG_DATE_FORMAT,
      language: SETTING_KEYS.ORG_LANGUAGE,
      financialYearStartMonth: SETTING_KEYS.ORG_FINANCIAL_YEAR_START_MONTH,
    };

    if (dto.logo !== undefined && organizationId) {
      const repo = this.getRepository(dataSource);
      const existing = await repo.findOne({ where: { key: SETTING_KEYS.ORG_LOGO } });
      await this.deleteLogoAsset(existing?.value, organizationId);
    }

    for (const [field, key] of Object.entries(mapping)) {
      if (dto[field] !== undefined) {
        await this.setSetting(key, dto[field], dataSource);
        updates[key] = dto[field];
      }
    }

    return updates;
  }

  private async deleteLogoAsset(
    logoValue: unknown,
    organizationId: string,
  ): Promise<void> {
    const storageKey = this.extractLogoStorageKey(logoValue);
    if (
      storageKey &&
      this.storageService.isS3StorageKey(storageKey)
    ) {
      await this.storageService.deleteStorageKey(storageKey);
    }
  }

  extractLogoStorageKey(logoValue: unknown): string | null {
    if (typeof logoValue === 'string' && logoValue.startsWith('organizations/')) {
      return logoValue;
    }
    if (
      logoValue &&
      typeof logoValue === 'object' &&
      'storageKey' in logoValue &&
      typeof (logoValue as { storageKey: unknown }).storageKey === 'string'
    ) {
      return (logoValue as { storageKey: string }).storageKey;
    }
    return null;
  }

  async getOrgProfile(dataSource: DataSource): Promise<Record<string, any>> {
    const profile: Record<string, any> = {};
    const allSettings = await this.getAllSettings(dataSource);

    const mapping = {
      [SETTING_KEYS.ORG_NAME]: 'name',
      [SETTING_KEYS.ORG_LOGO]: 'logo',
      [SETTING_KEYS.ORG_TIMEZONE]: 'timezone',
      [SETTING_KEYS.ORG_CURRENCY]: 'currency',
      [SETTING_KEYS.ORG_DATE_FORMAT]: 'dateFormat',
      [SETTING_KEYS.ORG_LANGUAGE]: 'language',
      [SETTING_KEYS.ORG_FINANCIAL_YEAR_START_MONTH]: 'financialYearStartMonth',
    };

    for (const setting of allSettings) {
      if (mapping[setting.key]) {
        profile[mapping[setting.key]] = setting.value;
      }
    }

    return profile;
  }

  async getOrgBranding(
    dataSource: DataSource,
  ): Promise<{ name?: string; logo?: unknown }> {
    const profile = await this.getOrgProfile(dataSource);
    return {
      name: profile.name,
      logo: profile.logo,
    };
  }

  private getRepository(
    dataSource: DataSource,
  ): Repository<OrganizationSetting> {
    return dataSource.getRepository(OrganizationSetting);
  }

  async getEmployeeSettings(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, any>> {
    const employeeSettings: Record<string, any> = {};
    const allSettings = await this.getAllSettings(dataSource);

    const mapping = {
      [SETTING_KEYS.EMPLOYEE_ID_PREFIX]: 'id_prefix',
      [SETTING_KEYS.EMPLOYEE_AUTO_GENERATE_ID]: 'auto_generate_id',
      [SETTING_KEYS.EMPLOYEE_REQUIRED_FIELDS]: 'required_fields',
      [SETTING_KEYS.EMPLOYEE_DEFAULT_PROBATION_PERIOD]:
        'default_probation_period',
    };

    for (const setting of allSettings) {
      if (mapping[setting.key]) {
        employeeSettings[mapping[setting.key]] = setting.value;
      }
    }

    const departmentRepo = dataSource.getRepository(Department);
    const designationRepo = dataSource.getRepository(Designation);
    const mappingRepo = dataSource.getRepository(DesignationDepartment);

    const whereByOrg = organizationId ? { organizationId } : {};
    const [departments, designations, designationMappings] = await Promise.all([
      departmentRepo.find({ where: whereByOrg, order: { name: 'ASC' } }),
      designationRepo.find({ where: whereByOrg, order: { name: 'ASC' } }),
      mappingRepo.find({ where: whereByOrg }),
    ]);

    const designationToDepartments = new Map<string, string[]>();
    for (const row of designationMappings) {
      const existing = designationToDepartments.get(row.designationId) || [];
      existing.push(row.departmentId);
      designationToDepartments.set(row.designationId, existing);
    }

    employeeSettings.departments = departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code || undefined,
      isActive: d.isActive,
      createdAt: toIsoTimestamp(d.createdAt),
    }));
    employeeSettings.designations = designations.map((d) => ({
      id: d.id,
      name: d.name,
      departmentIds: designationToDepartments.get(d.id) || [],
      isActive: d.isActive,
      createdAt: toIsoTimestamp(d.createdAt),
    }));

    return employeeSettings;
  }

  async updateEmployeeSettings(
    dto: UpdateEmployeeSettingsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};

    const mapping = {
      id_prefix: SETTING_KEYS.EMPLOYEE_ID_PREFIX,
      auto_generate_id: SETTING_KEYS.EMPLOYEE_AUTO_GENERATE_ID,
      required_fields: SETTING_KEYS.EMPLOYEE_REQUIRED_FIELDS,
      default_probation_period: SETTING_KEYS.EMPLOYEE_DEFAULT_PROBATION_PERIOD,
    };

    for (const [field, key] of Object.entries(mapping)) {
      if (dto[field] !== undefined) {
        await this.setSetting(key, dto[field], dataSource);
        updates[key] = dto[field];
      }
    }

    if (dto.departments !== undefined || dto.designations !== undefined) {
      throw new BadRequestException(
        'Departments and designations must be updated via /settings/departments and /settings/designations',
      );
    }

    return updates;
  }

  async getDepartments(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ departments: Record<string, unknown>[] }> {
    const { departments } = await this.loadOrgStructure(dataSource, organizationId);
    return { departments };
  }

  async getDesignations(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ designations: Record<string, unknown>[] }> {
    const { designations } = await this.loadOrgStructure(dataSource, organizationId);
    return { designations };
  }

  async updateDepartments(
    dto: UpdateDepartmentsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ departments: Record<string, unknown>[] }> {
    await dataSource.transaction(async (em) => {
      const departmentRepo = em.getRepository(Department);
      const incomingIds = new Set(dto.departments.map((d) => d.id));
      const existingDepartments = organizationId
        ? await departmentRepo.find({ where: { organizationId } })
        : await departmentRepo.find();

      for (const dep of existingDepartments) {
        if (!incomingIds.has(dep.id)) {
          await departmentRepo.remove(dep);
        }
      }
      for (const dep of dto.departments) {
        await departmentRepo.save(
          departmentRepo.create({
            id: dep.id,
            organizationId,
            name: dep.name.trim(),
            code: dep.code?.trim() || null,
            isActive: dep.isActive,
          }),
        );
      }
    });

    await this.setSetting(
      SETTING_KEYS.EMPLOYEE_DEPARTMENTS,
      dto.departments,
      dataSource,
    );

    const { departments } = await this.loadOrgStructure(dataSource, organizationId);
    return { departments };
  }

  async updateDesignations(
    dto: UpdateDesignationsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ designations: Record<string, unknown>[] }> {
    await dataSource.transaction(async (em) => {
      const designationRepo = em.getRepository(Designation);
      const designationDepartmentRepo = em.getRepository(DesignationDepartment);
      const incomingIds = new Set(dto.designations.map((d) => d.id));
      const existingDesignations = organizationId
        ? await designationRepo.find({ where: { organizationId } })
        : await designationRepo.find();

      for (const des of existingDesignations) {
        if (!incomingIds.has(des.id)) {
          await designationRepo.remove(des);
        }
      }
      for (const des of dto.designations) {
        await designationRepo.save(
          designationRepo.create({
            id: des.id,
            organizationId,
            name: des.name.trim(),
            isActive: des.isActive,
          }),
        );
      }

      if (organizationId) {
        await designationDepartmentRepo.delete({ organizationId });
      } else {
        await designationDepartmentRepo.clear();
      }
      for (const des of dto.designations) {
        for (const depId of des.departmentIds) {
          await designationDepartmentRepo.save(
            designationDepartmentRepo.create({
              organizationId,
              designationId: des.id,
              departmentId: depId,
            }),
          );
        }
      }
    });

    await this.setSetting(
      SETTING_KEYS.EMPLOYEE_DESIGNATIONS,
      dto.designations,
      dataSource,
    );

    const { designations } = await this.loadOrgStructure(dataSource, organizationId);
    return { designations };
  }

  private async loadOrgStructure(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{
    departments: Record<string, unknown>[];
    designations: Record<string, unknown>[];
  }> {
    const departmentRepo = dataSource.getRepository(Department);
    const designationRepo = dataSource.getRepository(Designation);
    const mappingRepo = dataSource.getRepository(DesignationDepartment);

    const whereByOrg = organizationId ? { organizationId } : {};
    const [departments, designations, designationMappings] = await Promise.all([
      departmentRepo.find({ where: whereByOrg, order: { name: 'ASC' } }),
      designationRepo.find({ where: whereByOrg, order: { name: 'ASC' } }),
      mappingRepo.find({ where: whereByOrg }),
    ]);

    const designationToDepartments = new Map<string, string[]>();
    for (const row of designationMappings) {
      const existing = designationToDepartments.get(row.designationId) || [];
      existing.push(row.departmentId);
      designationToDepartments.set(row.designationId, existing);
    }

    return {
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code || undefined,
        isActive: d.isActive,
        createdAt: toIsoTimestamp(d.createdAt),
      })),
      designations: designations.map((d) => ({
        id: d.id,
        name: d.name,
        departmentIds: designationToDepartments.get(d.id) || [],
        isActive: d.isActive,
        createdAt: toIsoTimestamp(d.createdAt),
      })),
    };
  }

  async getAttendanceSettings(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, any>> {
    const attendanceSettings: Record<string, any> = {};
    const allSettings = await this.getAllSettings(dataSource);

    const mapping = {
      [SETTING_KEYS.ATTENDANCE_WORKING_DAYS]: 'working_days',
      [SETTING_KEYS.ATTENDANCE_GRACE_PERIOD]: 'grace_period_minutes',
      [SETTING_KEYS.ATTENDANCE_HALF_DAY_THRESHOLD]:
        'half_day_threshold_minutes',
      [SETTING_KEYS.ATTENDANCE_OVERTIME_ENABLED]: 'overtime_enabled',
      [SETTING_KEYS.ATTENDANCE_OVERTIME_RULES]: 'overtime_rules',
      [SETTING_KEYS.ATTENDANCE_TRACKING_MODE]: 'tracking_mode',
      [SETTING_KEYS.ATTENDANCE_GEO_FENCING_ENABLED]: 'geo_fencing_enabled',
      [SETTING_KEYS.ATTENDANCE_ALLOWED_IPS]: 'allowed_ip_addresses',
    };

    for (const setting of allSettings) {
      if (mapping[setting.key]) {
        attendanceSettings[mapping[setting.key]] = setting.value;
      }
    }

    attendanceSettings.shifts = await this.resolveShifts(
      dataSource,
      organizationId,
      allSettings,
    );

    return attendanceSettings;
  }

  private workShiftToApiRow(
    row: WorkShiftConfiguration,
    sessions: WorkShiftSession[] = [],
  ): Record<string, unknown> {
    const loc = row.location;
    const raw = row as unknown as Record<string, unknown>;
    const createdAt =
      readRowTimestamp(raw, 'createdAt') ?? readRowTimestamp(raw, 'updatedAt');
    return {
      id: row.id,
      name: row.name,
      start_time: row.startTime,
      end_time: row.endTime,
      break_minutes: row.breakMinutes,
      locationId: row.locationId,
      location_id: row.locationId,
      location: loc ? this.mapLocationConfigurationToApi(loc) : undefined,
      sessions: sessions.map((s) => ({
        sessionLabel: s.sessionLabel,
        start_time: s.startTime,
        end_time: s.endTime,
      })),
      createdAt,
      updatedAt: readRowTimestamp(raw, 'updatedAt'),
    };
  }

  /** Load shifts from work_shift_configurations with createdAt/updatedAt. */
  private async fetchShiftsFromDatabase(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, unknown>[]> {
    const shiftRepo = dataSource.getRepository(WorkShiftConfiguration);
    const sessionRepo = dataSource.getRepository(WorkShiftSession);
    const order = { sortOrder: 'ASC' as const, id: 'ASC' as const };

    const loadWithSessions = async (rows: WorkShiftConfiguration[]) => {
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const sessionRows = await sessionRepo.find({
        where: { shiftConfigurationId: In(ids) },
        order: { sortOrder: 'ASC', id: 'ASC' },
      });
      const byShift = new Map<string, WorkShiftSession[]>();
      for (const s of sessionRows) {
        const list = byShift.get(s.shiftConfigurationId) ?? [];
        list.push(s);
        byShift.set(s.shiftConfigurationId, list);
      }
      return rows.map((row) =>
        this.workShiftToApiRow(row, byShift.get(row.id) ?? []),
      );
    };

    if (organizationId) {
      const scoped = await shiftRepo.find({
        where: [{ organizationId }, { organizationId: IsNull() }],
        order,
      });
      if (scoped.length > 0) {
        return loadWithSessions(scoped);
      }
    }

    const all = await shiftRepo.find({ order });
    return loadWithSessions(all);
  }

  /** One-time migration: legacy JSON shifts → work_shift_configurations (gets real timestamps). */
  private async migrateJsonShiftsToDatabase(
    dataSource: DataSource,
    organizationId: string,
    jsonShifts: Record<string, unknown>[],
  ): Promise<void> {
    const shiftRepo = dataSource.getRepository(WorkShiftConfiguration);
    const scopedCount = await shiftRepo.count({
      where: [{ organizationId }, { organizationId: IsNull() }],
    });
    if (scopedCount > 0 || jsonShifts.length === 0) {
      return;
    }

    await dataSource.transaction(async (em) => {
      const wsRepo = em.getRepository(WorkShiftConfiguration);
      let order = 0;
      for (const item of jsonShifts) {
        const locationId =
          typeof item.locationId === 'string'
            ? item.locationId
            : typeof item.location_id === 'string'
              ? item.location_id
              : null;
        if (!locationId) {
          continue;
        }
        await wsRepo.save(
          wsRepo.create({
            organizationId,
            locationId,
            name: String(item.name ?? 'Shift'),
            startTime: String(item.start_time ?? '09:00'),
            endTime: String(item.end_time ?? '18:00'),
            breakMinutes: Number(item.break_minutes ?? 0),
            sortOrder: order++,
          }),
        );
      }

      const osRepo = em.getRepository(OrganizationSetting);
      const legacy = await osRepo.findOne({
        where: { key: SETTING_KEYS.ATTENDANCE_SHIFTS },
      });
      if (legacy) {
        legacy.value = [];
        await osRepo.save(legacy);
      }
    });

    this.logger.log(
      `Migrated ${jsonShifts.length} legacy attendance shift(s) into work_shift_configurations`,
    );
  }

  private async resolveShifts(
    dataSource: DataSource,
    organizationId: string | undefined,
    allSettings: OrganizationSetting[],
  ): Promise<Record<string, unknown>[]> {
    const jsonRow = allSettings.find((s) => s.key === SETTING_KEYS.ATTENDANCE_SHIFTS);
    const jsonShifts = Array.isArray(jsonRow?.value) ? jsonRow.value : [];

    if (organizationId && jsonShifts.length > 0) {
      const shiftRepo = dataSource.getRepository(WorkShiftConfiguration);
      const scopedCount = await shiftRepo.count({
        where: [{ organizationId }, { organizationId: IsNull() }],
      });
      if (scopedCount === 0) {
        await this.migrateJsonShiftsToDatabase(
          dataSource,
          organizationId,
          jsonShifts as Record<string, unknown>[],
        );
      }
    }

    const fromDb = await this.fetchShiftsFromDatabase(dataSource, organizationId);
    if (fromDb.length > 0) {
      return fromDb;
    }

    if (jsonShifts.length > 0) {
      return (jsonShifts as Record<string, unknown>[]).map((item, index) => ({
        id: typeof item.id === 'string' ? item.id : undefined,
        name: String(item.name ?? 'Shift'),
        start_time: String(item.start_time ?? '09:00'),
        end_time: String(item.end_time ?? '18:00'),
        break_minutes: Number(item.break_minutes ?? 0),
        locationId:
          typeof item.locationId === 'string'
            ? item.locationId
            : typeof item.location_id === 'string'
              ? item.location_id
              : undefined,
        createdAt: toIsoTimestamp(
          (item.createdAt ?? item.created_at) as Date | string | undefined,
        ),
        sortOrder: index,
      }));
    }

    return [];
  }

  async updateAttendanceSettings(
    dto: UpdateAttendanceSettingsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};

    const mapping = {
      working_days: SETTING_KEYS.ATTENDANCE_WORKING_DAYS,
      grace_period_minutes: SETTING_KEYS.ATTENDANCE_GRACE_PERIOD,
      half_day_threshold_minutes: SETTING_KEYS.ATTENDANCE_HALF_DAY_THRESHOLD,
      overtime_enabled: SETTING_KEYS.ATTENDANCE_OVERTIME_ENABLED,
      overtime_rules: SETTING_KEYS.ATTENDANCE_OVERTIME_RULES,
      tracking_mode: SETTING_KEYS.ATTENDANCE_TRACKING_MODE,
      geo_fencing_enabled: SETTING_KEYS.ATTENDANCE_GEO_FENCING_ENABLED,
      allowed_ip_addresses: SETTING_KEYS.ATTENDANCE_ALLOWED_IPS,
    };

    for (const [field, key] of Object.entries(mapping)) {
      if (dto[field] !== undefined) {
        await this.setSetting(key, dto[field], dataSource);
        updates[key] = dto[field];
      }
    }

    if (dto.shifts !== undefined) {
      if (!organizationId) {
        throw new BadRequestException(
          'Organization context is required to save work shifts',
        );
      }
      for (const s of dto.shifts) {
        if (!s.locationId) {
          throw new BadRequestException(
            'Each shift must include a locationId referencing a configured branch',
          );
        }
      }
      const distinctLocIds = [...new Set(dto.shifts.map((s) => s.locationId))];
      const locCheckRepo = dataSource.getRepository(LocationConfiguration);
      const validLocs = await locCheckRepo.find({
        where: { id: In(distinctLocIds), organizationId },
      });
      if (validLocs.length !== distinctLocIds.length) {
        throw new BadRequestException(
          'One or more location_id values are invalid for this organization',
        );
      }

      await dataSource.transaction(async (em) => {
        const wsRepo = em.getRepository(WorkShiftConfiguration);
        const sessionRepo = em.getRepository(WorkShiftSession);
        const existing = await wsRepo.find({ where: { organizationId } });
        const incomingIds = new Set(
          dto.shifts
            .map((s) => s.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0),
        );

        for (const row of existing) {
          if (!incomingIds.has(row.id)) {
            await wsRepo.remove(row);
          }
        }

        let order = 0;
        for (const s of dto.shifts) {
          const payload = {
            organizationId,
            locationId: s.locationId,
            name: s.name,
            startTime: s.start_time,
            endTime: s.end_time,
            breakMinutes: s.break_minutes ?? 0,
            sortOrder: order++,
          };

          const existingRow =
            s.id && incomingIds.has(s.id)
              ? existing.find((r) => r.id === s.id)
              : undefined;

          let saved: WorkShiftConfiguration;
          if (existingRow) {
            saved = await wsRepo.save({ ...existingRow, ...payload });
          } else if (s.id) {
            saved = await wsRepo.save(wsRepo.create({ id: s.id, ...payload }));
          } else {
            saved = await wsRepo.save(wsRepo.create(payload));
          }

          await sessionRepo.delete({ shiftConfigurationId: saved.id });
          const sessionDefs = Array.isArray(s.sessions) ? s.sessions : [];
          if (sessionDefs.length > 0) {
            let sOrder = 0;
            for (const sess of sessionDefs) {
              await sessionRepo.save(
                sessionRepo.create({
                  shiftConfigurationId: saved.id,
                  sessionLabel:
                    sess.sessionLabel?.trim() || `Session ${sOrder + 1}`,
                  startTime: sess.start_time,
                  endTime: sess.end_time,
                  sortOrder: sOrder++,
                }),
              );
            }
          }
        }

        const osRepo = em.getRepository(OrganizationSetting);
        const legacy = await osRepo.findOne({
          where: { key: SETTING_KEYS.ATTENDANCE_SHIFTS },
        });
        if (legacy) {
          legacy.value = [];
          await osRepo.save(legacy);
        }
      });
      updates[SETTING_KEYS.ATTENDANCE_SHIFTS] = [];
      const allSettings = await this.getAllSettings(dataSource);
      updates.shifts = await this.resolveShifts(
        dataSource,
        organizationId,
        allSettings,
      );
    }

    return updates;
  }

  async getLocationConfigurations(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ locations: Record<string, unknown>[] }> {
    if (!organizationId) {
      return { locations: [] };
    }
    const repo = dataSource.getRepository(LocationConfiguration);
    const rows = await repo.find({
      where: { organizationId },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
    return { locations: rows.map((r) => this.mapLocationConfigurationToApi(r)) };
  }

  async updateLocationConfigurations(
    dto: UpdateLocationConfigurationsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ locations: Record<string, unknown>[] }> {
    if (!organizationId) {
      throw new BadRequestException(
        'Organization context is required to save location configurations',
      );
    }
    await dataSource.transaction(async (em) => {
      const repo = em.getRepository(LocationConfiguration);
      const incomingIds = new Set(dto.locations.map((l) => l.id));
      const existing = await repo.find({ where: { organizationId } });
      for (const row of existing) {
        if (!incomingIds.has(row.id)) {
          await repo.remove(row);
        }
      }
      let order = 0;
      for (const item of dto.locations) {
        await repo.save(
          repo.create({
            id: item.id,
            organizationId,
            name: item.name.trim(),
            code: item.code?.trim() || null,
            addressLine1: item.addressLine1?.trim() || null,
            city: item.city?.trim() || null,
            region: item.region?.trim() || null,
            postalCode: item.postalCode?.trim() || null,
            country: item.country?.trim() || null,
            latitude:
              item.latitude != null && !Number.isNaN(item.latitude)
                ? String(item.latitude)
                : null,
            longitude:
              item.longitude != null && !Number.isNaN(item.longitude)
                ? String(item.longitude)
                : null,
            isActive: item.isActive,
            sortOrder: item.sortOrder ?? order,
          }),
        );
        order += 1;
      }
    });
    return this.getLocationConfigurations(dataSource, organizationId);
  }

  private mapLocationConfigurationToApi(
    row: LocationConfiguration,
  ): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? undefined,
      addressLine1: row.addressLine1 ?? undefined,
      city: row.city ?? undefined,
      region: row.region ?? undefined,
      postalCode: row.postalCode ?? undefined,
      country: row.country ?? undefined,
      latitude:
        row.latitude != null && row.latitude !== ''
          ? Number(row.latitude)
          : undefined,
      longitude:
        row.longitude != null && row.longitude !== ''
          ? Number(row.longitude)
          : undefined,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  async getLeaveConfigurations(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ leaves: Record<string, unknown>[] }> {
    if (!organizationId) {
      return { leaves: [] };
    }
    const repo = dataSource.getRepository(LeaveConfiguration);
    const rows = await repo.find({
      where: { organizationId },
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });
    return { leaves: rows.map((r) => this.mapLeaveConfigurationToApi(r)) };
  }

  async updateLeaveConfigurations(
    dto: UpdateLeaveConfigurationsDto,
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<{ leaves: Record<string, unknown>[] }> {
    if (!organizationId) {
      throw new BadRequestException(
        'Organization context is required to save leave configurations',
      );
    }
    if (dto.leaves.length > 0) {
      const distinctLocationIds = [
        ...new Set(dto.leaves.map((l) => l.locationId)),
      ];
      const locRepo = dataSource.getRepository(LocationConfiguration);
      const validLocs = await locRepo.find({
        where: { organizationId, id: In(distinctLocationIds) },
      });
      if (validLocs.length !== distinctLocationIds.length) {
        throw new BadRequestException(
          'One or more locationId values are invalid for this organization',
        );
      }
    }

    await dataSource.transaction(async (em) => {
      const repo = em.getRepository(LeaveConfiguration);
      const incomingIds = new Set(dto.leaves.map((l) => l.id));
      const existing = await repo.find({ where: { organizationId } });
      for (const row of existing) {
        if (!incomingIds.has(row.id)) {
          await repo.remove(row);
        }
      }
      let order = 0;
      for (const item of dto.leaves) {
        const maxCarry =
          item.maxCarryForwardDays != null && !Number.isNaN(item.maxCarryForwardDays)
            ? String(item.maxCarryForwardDays)
            : null;
        const docAfter =
          item.supportingDocumentAfterDays != null &&
          !Number.isNaN(Number(item.supportingDocumentAfterDays))
            ? Math.round(Number(item.supportingDocumentAfterDays))
            : null;
        const maxConsecutive =
          item.maxConsecutiveDays != null &&
          !Number.isNaN(Number(item.maxConsecutiveDays))
            ? Math.round(Number(item.maxConsecutiveDays))
            : null;
        const workflow =
          Array.isArray(item.approvalWorkflow) && item.approvalWorkflow.length > 0
            ? item.approvalWorkflow
            : item.requiresApproval === false
              ? []
              : ['MANAGER', 'HR', 'ADMIN'];
        await repo.save(
          repo.create({
            id: item.id,
            organizationId,
            locationId: item.locationId,
            name: item.name.trim(),
            code: item.code?.trim() || null,
            description: item.description?.trim() || null,
            leaveCategory: item.leaveCategory?.trim() || null,
            accrualType: item.accrualType?.trim() || 'MONTHLY',
            encashmentAllowed: item.encashmentAllowed ?? false,
            negativeBalanceAllowed: item.negativeBalanceAllowed ?? false,
            supportingDocumentAfterDays: docAfter,
            maxConsecutiveDays: maxConsecutive,
            weekendsCountAsLeave: item.weekendsCountAsLeave ?? false,
            holidaysCountAsLeave: item.holidaysCountAsLeave ?? false,
            approvalWorkflow: workflow,
            appliesTo:
              item.appliesTo?.trim() === 'ALL_BRANCHES' ? 'ALL_BRANCHES' : 'ALL_EMPLOYEES',
            isPaid: item.isPaid,
            annualEntitlementDays: String(item.annualEntitlementDays),
            allowCarryForward: item.allowCarryForward,
            maxCarryForwardDays: maxCarry,
            requiresApproval: item.requiresApproval,
            requiresSupportingDocument: item.requiresSupportingDocument,
            allowHalfDay: item.allowHalfDay,
            isActive: item.isActive,
            sortOrder: item.sortOrder ?? order,
          }),
        );
        order += 1;
      }
    });
    return this.getLeaveConfigurations(dataSource, organizationId);
  }

  private mapLeaveConfigurationToApi(
    row: LeaveConfiguration,
  ): Record<string, unknown> {
    const workflow =
      Array.isArray(row.approvalWorkflow) && row.approvalWorkflow.length > 0
        ? row.approvalWorkflow
        : row.requiresApproval === false
          ? []
          : ['MANAGER', 'HR', 'ADMIN'];
    return {
      id: row.id,
      locationId: row.locationId,
      name: row.name,
      code: row.code ?? undefined,
      description: row.description ?? undefined,
      leaveCategory: row.leaveCategory ?? undefined,
      accrualType: row.accrualType ?? 'MONTHLY',
      encashmentAllowed: row.encashmentAllowed ?? false,
      negativeBalanceAllowed: row.negativeBalanceAllowed ?? false,
      supportingDocumentAfterDays:
        row.supportingDocumentAfterDays != null
          ? Number(row.supportingDocumentAfterDays)
          : undefined,
      maxConsecutiveDays:
        row.maxConsecutiveDays != null ? Number(row.maxConsecutiveDays) : undefined,
      weekendsCountAsLeave: row.weekendsCountAsLeave ?? false,
      holidaysCountAsLeave: row.holidaysCountAsLeave ?? false,
      approvalWorkflow: workflow,
      appliesTo: row.appliesTo === 'ALL_BRANCHES' ? 'ALL_BRANCHES' : 'ALL_EMPLOYEES',
      isPaid: row.isPaid,
      annualEntitlementDays:
        row.annualEntitlementDays != null && row.annualEntitlementDays !== ''
          ? Number(row.annualEntitlementDays)
          : 0,
      allowCarryForward: row.allowCarryForward,
      maxCarryForwardDays:
        row.maxCarryForwardDays != null && row.maxCarryForwardDays !== ''
          ? Number(row.maxCarryForwardDays)
          : undefined,
      requiresApproval: row.requiresApproval,
      requiresSupportingDocument: row.requiresSupportingDocument,
      allowHalfDay: row.allowHalfDay,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    };
  }

  async getDefaultShift(
    dataSource: DataSource,
    organizationId?: string,
  ): Promise<ShiftDto | null> {
    const settings = await this.getAttendanceSettings(
      dataSource,
      organizationId,
    );
    const shifts = settings.shifts;

    if (!shifts || shifts.length === 0) {
      return null;
    }

    return shifts[0] as ShiftDto;
  }

  async getTimesheetSettings(
    dataSource: DataSource,
  ): Promise<Record<string, unknown>> {
    const allSettings = await this.getAllSettings(dataSource);
    const mapping: Record<string, string> = {
      [SETTING_KEYS.TIMESHEET_MAX_HOURS_PER_DAY]: 'max_hours_per_day',
      [SETTING_KEYS.TIMESHEET_MAX_PAST_DAYS]: 'max_past_days',
      [SETTING_KEYS.TIMESHEET_REQUIRE_SUBMISSION_BY_EOD]:
        'require_submission_by_eod',
      [SETTING_KEYS.TIMESHEET_EMPLOYEE_HELPER_TEXT]: 'employee_helper_text',
      [SETTING_KEYS.TIMESHEET_WEEK_STARTS_ON]: 'week_starts_on',
    };

    const result: Record<string, unknown> = {
      ...DEFAULT_TIMESHEET_SETTINGS,
    };

    for (const setting of allSettings) {
      const field = mapping[setting.key];
      if (field) {
        result[field] = setting.value;
      }
    }

    return result;
  }

  async updateTimesheetSettings(
    dto: UpdateTimesheetSettingsDto,
    dataSource: DataSource,
  ): Promise<Record<string, unknown>> {
    const updates: Record<string, unknown> = {};
    const mapping: Record<string, string> = {
      max_hours_per_day: SETTING_KEYS.TIMESHEET_MAX_HOURS_PER_DAY,
      max_past_days: SETTING_KEYS.TIMESHEET_MAX_PAST_DAYS,
      require_submission_by_eod: SETTING_KEYS.TIMESHEET_REQUIRE_SUBMISSION_BY_EOD,
      employee_helper_text: SETTING_KEYS.TIMESHEET_EMPLOYEE_HELPER_TEXT,
      week_starts_on: SETTING_KEYS.TIMESHEET_WEEK_STARTS_ON,
    };

    for (const [field, key] of Object.entries(mapping)) {
      if (dto[field as keyof UpdateTimesheetSettingsDto] !== undefined) {
        const value = dto[field as keyof UpdateTimesheetSettingsDto];
        await this.setSetting(key, value, dataSource);
        updates[key] = value;
      }
    }

    return { ...updates, ...(await this.getTimesheetSettings(dataSource)) };
  }
}
