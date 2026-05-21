import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import {
  CreateSettingDto,
  UpdateOrgProfileDto,
  UpdateEmployeeSettingsDto,
  UpdateAttendanceSettingsDto,
} from './dto/create-setting.dto';
import { UpdateLocationConfigurationsDto } from './dto/location-configuration.dto';
import { UpdateLeaveConfigurationsDto } from './dto/leave-configuration.dto';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Specific routes MUST come before parameterized routes (:key)

  @Get('profile')
  @ApiOperation({ summary: 'Get organization profile settings' })
  async getOrgProfile(@Req() req: TenantRequest) {
    return this.settingsService.getOrgProfile(req.tenantDataSource);
  }

  @Post('profile')
  @ApiOperation({ summary: 'Update organization profile settings' })
  async updateOrgProfile(
    @Req() req: TenantRequest,
    @Body() dto: UpdateOrgProfileDto,
  ) {
    const updates = await this.settingsService.updateOrgProfile(
      dto,
      req.tenantDataSource,
    );
    return { message: 'Profile updated successfully', updates };
  }

  @Get('employee')
  @ApiOperation({ summary: 'Get employee settings' })
  async getEmployeeSettings(@Req() req: TenantRequest) {
    return this.settingsService.getEmployeeSettings(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('employee')
  @ApiOperation({ summary: 'Update employee settings (bulk update)' })
  async updateEmployeeSettings(
    @Req() req: TenantRequest,
    @Body() dto: UpdateEmployeeSettingsDto,
  ) {
    const updates = await this.settingsService.updateEmployeeSettings(
      dto,
      req.tenantDataSource,
      req.organization?.id,
    );
    return { message: 'Employee settings updated successfully', updates };
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get attendance settings' })
  async getAttendanceSettings(@Req() req: TenantRequest) {
    return this.settingsService.getAttendanceSettings(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('attendance')
  @ApiOperation({ summary: 'Update attendance settings (bulk update)' })
  async updateAttendanceSettings(
    @Req() req: TenantRequest,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    const updates = await this.settingsService.updateAttendanceSettings(
      dto,
      req.tenantDataSource,
      req.organization?.id,
    );
    return { message: 'Attendance settings updated successfully', updates };
  }

  @Get('locations')
  @ApiOperation({ summary: 'List branch / location configurations for the organization' })
  async getLocationConfigurations(@Req() req: TenantRequest) {
    return this.settingsService.getLocationConfigurations(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('locations')
  @ApiOperation({ summary: 'Replace branch / location configurations for the organization' })
  async updateLocationConfigurations(
    @Req() req: TenantRequest,
    @Body() dto: UpdateLocationConfigurationsDto,
  ) {
    const result = await this.settingsService.updateLocationConfigurations(
      dto,
      req.tenantDataSource,
      req.organization?.id,
    );
    return {
      message: 'Location configurations updated successfully',
      ...result,
    };
  }

  @Get('leave-config')
  @ApiOperation({
    summary: 'List leave type master rows (per branch) for the organization',
  })
  async getLeaveConfigurations(@Req() req: TenantRequest) {
    return this.settingsService.getLeaveConfigurations(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('leave-config')
  @ApiOperation({
    summary: 'Replace leave type master rows for the organization',
  })
  async updateLeaveConfigurations(
    @Req() req: TenantRequest,
    @Body() dto: UpdateLeaveConfigurationsDto,
  ) {
    const result = await this.settingsService.updateLeaveConfigurations(
      dto,
      req.tenantDataSource,
      req.organization?.id,
    );
    return {
      message: 'Leave configurations updated successfully',
      ...result,
    };
  }

  // General routes (come after specific routes)

  @Get()
  @ApiOperation({ summary: 'Get all settings for organization' })
  async getAllSettings(@Req() req: TenantRequest) {
    return this.settingsService.getAllSettings(req.tenantDataSource);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get setting by key' })
  async getSetting(@Req() req: TenantRequest, @Param('key') key: string) {
    return this.settingsService.getSetting(key, req.tenantDataSource);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a setting' })
  async setSetting(@Req() req: TenantRequest, @Body() dto: CreateSettingDto) {
    return this.settingsService.setSetting(
      dto.key,
      dto.value,
      req.tenantDataSource,
    );
  }
}
