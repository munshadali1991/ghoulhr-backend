import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { UpdateTimesheetSettingsDto } from './dto/timesheet-settings.dto';
import { UpdateLocationConfigurationsDto } from './dto/location-configuration.dto';
import { UpdateLeaveConfigurationsDto } from './dto/leave-configuration.dto';
import {
  CreateTimesheetCategoryDto,
  UpdateTimesheetCategoryDto,
} from './dto/timesheet-category.dto';
import { TimesheetCategoryService } from './timesheet-category.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly timesheetCategoryService: TimesheetCategoryService,
  ) {}

  @Get('profile')
  @RequirePermissions('settings.organization:read')
  @ApiOperation({ summary: 'Get organization profile settings' })
  async getOrgProfile(@Req() req: TenantRequest) {
    return this.settingsService.getOrgProfile(req.tenantDataSource);
  }

  @Post('profile')
  @RequirePermissions('settings.organization:write')
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
  @RequirePermissions('settings.employees:read')
  @ApiOperation({ summary: 'Get employee settings' })
  async getEmployeeSettings(@Req() req: TenantRequest) {
    return this.settingsService.getEmployeeSettings(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('employee')
  @RequirePermissions('settings.employees:write')
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
  @RequirePermissions('settings.attendance:read')
  @ApiOperation({ summary: 'Get attendance settings' })
  async getAttendanceSettings(@Req() req: TenantRequest) {
    return this.settingsService.getAttendanceSettings(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('attendance')
  @RequirePermissions('settings.attendance:write')
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

  @Get('timesheet')
  @RequirePermissions('settings.timesheet:read')
  @ApiOperation({ summary: 'Get timesheet settings' })
  async getTimesheetSettings(@Req() req: TenantRequest) {
    return this.settingsService.getTimesheetSettings(req.tenantDataSource);
  }

  @Post('timesheet')
  @RequirePermissions('settings.timesheet:write')
  @ApiOperation({ summary: 'Update timesheet settings' })
  async updateTimesheetSettings(
    @Req() req: TenantRequest,
    @Body() dto: UpdateTimesheetSettingsDto,
  ) {
    const settings = await this.settingsService.updateTimesheetSettings(
      dto,
      req.tenantDataSource,
    );
    return { message: 'Timesheet settings updated successfully', settings };
  }

  @Get('timesheet/categories')
  @RequirePermissions('settings.timesheet:read')
  @ApiOperation({ summary: 'List timesheet categories (admin)' })
  async getTimesheetCategories(@Req() req: TenantRequest) {
    return this.timesheetCategoryService.listCategories(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Post('timesheet/categories')
  @RequirePermissions('settings.timesheet:write')
  @ApiOperation({ summary: 'Create timesheet category' })
  async createTimesheetCategory(
    @Req() req: TenantRequest,
    @Body() dto: CreateTimesheetCategoryDto,
  ) {
    const category = await this.timesheetCategoryService.createCategory(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
    return { message: 'Category created successfully', category };
  }

  @Put('timesheet/categories/:id')
  @RequirePermissions('settings.timesheet:write')
  @ApiOperation({ summary: 'Update timesheet category' })
  async updateTimesheetCategory(
    @Req() req: TenantRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTimesheetCategoryDto,
  ) {
    const category = await this.timesheetCategoryService.updateCategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
    return { message: 'Category updated successfully', category };
  }

  @Delete('timesheet/categories/:id')
  @RequirePermissions('settings.timesheet:write')
  @ApiOperation({ summary: 'Delete timesheet category' })
  async deleteTimesheetCategory(@Req() req: TenantRequest, @Param('id') id: string) {
    await this.timesheetCategoryService.deleteCategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
    return { message: 'Category deleted successfully' };
  }

  @Get('locations')
  @RequirePermissions('settings.locations:read')
  @ApiOperation({ summary: 'List branch / location configurations for the organization' })
  async getLocationConfigurations(@Req() req: TenantRequest) {
    return this.settingsService.getLocationConfigurations(
      req.tenantDataSource,
      req.organization?.id,
    );
  }

  @Post('locations')
  @RequirePermissions('settings.locations:write')
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
  @RequirePermissions('settings.leave:read')
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
  @RequirePermissions('settings.leave:write')
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

  @Get()
  @RequireAnyPermission(
    'settings.organization:read',
    'settings.employees:read',
    'settings.attendance:read',
    'settings.timesheet:read',
    'settings.locations:read',
    'settings.leave:read',
  )
  @ApiOperation({ summary: 'Get all settings for organization' })
  async getAllSettings(@Req() req: TenantRequest) {
    return this.settingsService.getAllSettings(req.tenantDataSource);
  }

  @Get(':key')
  @RequireAnyPermission(
    'settings.organization:read',
    'settings.employees:read',
    'settings.attendance:read',
    'settings.timesheet:read',
    'settings.locations:read',
    'settings.leave:read',
  )
  @ApiOperation({ summary: 'Get setting by key' })
  async getSetting(@Req() req: TenantRequest, @Param('key') key: string) {
    return this.settingsService.getSetting(key, req.tenantDataSource);
  }

  @Post()
  @RequireAnyPermission(
    'settings.organization:write',
    'settings.employees:write',
    'settings.attendance:write',
    'settings.timesheet:write',
    'settings.locations:write',
    'settings.leave:write',
  )
  @ApiOperation({ summary: 'Create or update a setting' })
  async setSetting(@Req() req: TenantRequest, @Body() dto: CreateSettingDto) {
    return this.settingsService.setSetting(
      dto.key,
      dto.value,
      req.tenantDataSource,
    );
  }
}
