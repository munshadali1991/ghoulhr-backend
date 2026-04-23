import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { OrganizationSetting } from './entities/organization-setting.entity';
import { CreateSettingDto, UpdateOrgProfileDto, UpdateEmployeeSettingsDto, UpdateAttendanceSettingsDto, ShiftDto } from './dto/create-setting.dto';
import { SETTING_KEYS } from './settings.constants';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  async getSetting(key: string, dataSource: DataSource): Promise<OrganizationSetting> {
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

  async setSetting(key: string, value: any, dataSource: DataSource): Promise<OrganizationSetting> {
    const repo = this.getRepository(dataSource);
    
    let setting = await repo.findOne({ where: { key } });
    
    if (setting) {
      setting.value = value;
    } else {
      setting = repo.create({ key, value });
    }
    
    return repo.save(setting);
  }

  async updateOrgProfile(dto: UpdateOrgProfileDto, dataSource: DataSource): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};
    
    const mapping = {
      name: SETTING_KEYS.ORG_NAME,
      logo: SETTING_KEYS.ORG_LOGO,
      timezone: SETTING_KEYS.ORG_TIMEZONE,
      currency: SETTING_KEYS.ORG_CURRENCY,
      dateFormat: SETTING_KEYS.ORG_DATE_FORMAT,
      language: SETTING_KEYS.ORG_LANGUAGE,
    };

    for (const [field, key] of Object.entries(mapping)) {
      if (dto[field] !== undefined) {
        await this.setSetting(key, dto[field], dataSource);
        updates[key] = dto[field];
      }
    }

    return updates;
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
    };

    for (const setting of allSettings) {
      if (mapping[setting.key]) {
        profile[mapping[setting.key]] = setting.value;
      }
    }

    return profile;
  }

  private getRepository(dataSource: DataSource): Repository<OrganizationSetting> {
    return dataSource.getRepository(OrganizationSetting);
  }

  async getEmployeeSettings(dataSource: DataSource): Promise<Record<string, any>> {
    const employeeSettings: Record<string, any> = {};
    const allSettings = await this.getAllSettings(dataSource);
    
    const mapping = {
      [SETTING_KEYS.EMPLOYEE_ID_PREFIX]: 'id_prefix',
      [SETTING_KEYS.EMPLOYEE_AUTO_GENERATE_ID]: 'auto_generate_id',
      [SETTING_KEYS.EMPLOYEE_REQUIRED_FIELDS]: 'required_fields',
      [SETTING_KEYS.EMPLOYEE_DEFAULT_PROBATION_PERIOD]: 'default_probation_period',
    };

    for (const setting of allSettings) {
      if (mapping[setting.key]) {
        employeeSettings[mapping[setting.key]] = setting.value;
      }
    }

    return employeeSettings;
  }

  async updateEmployeeSettings(dto: UpdateEmployeeSettingsDto, dataSource: DataSource): Promise<Record<string, any>> {
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

    return updates;
  }

  async getAttendanceSettings(dataSource: DataSource): Promise<Record<string, any>> {
    const attendanceSettings: Record<string, any> = {};
    const allSettings = await this.getAllSettings(dataSource);
    
    const mapping = {
      [SETTING_KEYS.ATTENDANCE_WORKING_DAYS]: 'working_days',
      [SETTING_KEYS.ATTENDANCE_SHIFTS]: 'shifts',
      [SETTING_KEYS.ATTENDANCE_GRACE_PERIOD]: 'grace_period_minutes',
      [SETTING_KEYS.ATTENDANCE_HALF_DAY_THRESHOLD]: 'half_day_threshold_minutes',
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

    return attendanceSettings;
  }

  async updateAttendanceSettings(dto: UpdateAttendanceSettingsDto, dataSource: DataSource): Promise<Record<string, any>> {
    const updates: Record<string, any> = {};
    
    const mapping = {
      working_days: SETTING_KEYS.ATTENDANCE_WORKING_DAYS,
      shifts: SETTING_KEYS.ATTENDANCE_SHIFTS,
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

    return updates;
  }

  async getDefaultShift(dataSource: DataSource): Promise<ShiftDto | null> {
    const settings = await this.getAttendanceSettings(dataSource);
    const shifts = settings.shifts;
    
    if (!shifts || shifts.length === 0) {
      return null;
    }
    
    return shifts[0];
  }
}
