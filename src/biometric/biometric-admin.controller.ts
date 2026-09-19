import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { BiometricDevicesService } from './biometric-devices.service';
import { BiometricMappingService } from './biometric-mapping.service';
import {
  AssignBiometricIdDto,
  CreateBiometricDeviceDto,
  ResolveUnmappedPunchDto,
  UpdateBiometricDeviceDto,
} from './dto/biometric-admin.dto';

@ApiTags('Biometric')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller()
export class BiometricAdminController {
  constructor(
    private readonly devicesService: BiometricDevicesService,
    private readonly mappingService: BiometricMappingService,
  ) {}

  @Get('settings/biometric/devices')
  @RequirePermissions('settings.biometric.devices:read')
  @ApiOperation({ summary: 'List biometric devices' })
  listDevices(@Req() req: TenantRequest) {
    return this.devicesService.list(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Post('settings/biometric/devices')
  @RequirePermissions('settings.biometric.devices:write')
  @ApiOperation({ summary: 'Register a biometric device' })
  async createDevice(
    @Req() req: TenantRequest,
    @Body() dto: CreateBiometricDeviceDto,
  ) {
    const device = await this.devicesService.create(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
      req.user?.sub,
    );
    return { message: 'Device registered', device };
  }

  @Put('settings/biometric/devices/:id')
  @RequirePermissions('settings.biometric.devices:write')
  @ApiOperation({ summary: 'Update a biometric device' })
  async updateDevice(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBiometricDeviceDto,
  ) {
    const device = await this.devicesService.update(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
      req.user?.sub,
    );
    return { message: 'Device updated', device };
  }

  @Delete('settings/biometric/devices/:id')
  @RequirePermissions('settings.biometric.devices:write')
  @ApiOperation({ summary: 'Soft-delete a biometric device' })
  async deleteDevice(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: { reason?: string },
  ) {
    await this.devicesService.remove(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      req.user?.sub,
      body?.reason,
    );
    return { message: 'Device deleted' };
  }

  @Get('settings/biometric/mappings')
  @RequirePermissions('settings.biometric.mapping:read')
  @ApiOperation({ summary: 'List employees with biometric IDs' })
  listMappings(@Req() req: TenantRequest, @Query('q') q?: string) {
    return this.mappingService.listMappings(
      req.tenantDataSource!,
      req.organization!.id,
      q,
    );
  }

  @Get('settings/biometric/mappings/next-id')
  @RequirePermissions('settings.biometric.mapping:read')
  @ApiOperation({ summary: 'Preview next auto-assigned biometric ID' })
  async nextId(@Req() req: TenantRequest) {
    const biometricId = await this.mappingService.nextBiometricId(
      req.tenantDataSource!,
      req.organization!.id,
    );
    return { biometricId };
  }

  @Put('settings/biometric/mappings/:employeeId')
  @RequirePermissions('settings.biometric.mapping:write')
  @ApiOperation({ summary: 'Assign or update employee biometric ID' })
  async assignMapping(
    @Req() req: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: AssignBiometricIdDto,
  ) {
    const mapping = await this.mappingService.assignBiometricId(
      req.tenantDataSource!,
      req.organization!.id,
      employeeId,
      dto,
      req.user?.sub,
    );
    return { message: 'Biometric ID assigned', mapping };
  }

  @Delete('settings/biometric/mappings/:employeeId')
  @RequirePermissions('settings.biometric.mapping:write')
  @ApiOperation({ summary: 'Clear employee biometric ID' })
  async clearMapping(
    @Req() req: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() body?: { reason?: string },
  ) {
    await this.mappingService.clearBiometricId(
      req.tenantDataSource!,
      req.organization!.id,
      employeeId,
      req.user?.sub,
      body?.reason,
    );
    return { message: 'Biometric ID cleared' };
  }

  @Get('settings/biometric/unmapped')
  @RequirePermissions('ess.attendance.unmapped:read')
  @ApiOperation({ summary: 'List unmapped biometric punches' })
  listUnmapped(
    @Req() req: TenantRequest,
    @Query('status') status?: string,
  ) {
    return this.mappingService.listUnmapped(
      req.tenantDataSource!,
      req.organization!.id,
      status,
    );
  }

  @Post('settings/biometric/unmapped/:id/resolve')
  @RequirePermissions('ess.attendance.unmapped:write')
  @ApiOperation({ summary: 'Bind or ignore an unmapped punch' })
  async resolveUnmapped(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveUnmappedPunchDto,
  ) {
    if (dto.action === 'bind' && !dto.employeeId) {
      throw new BadRequestException('employeeId is required when action=bind');
    }
    const result = await this.mappingService.resolveUnmapped(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
      req.user?.sub,
    );
    return { message: 'Unmapped punch resolved', result };
  }

  @Get('ess/attendance/live')
  @RequirePermissions('ess.attendance.live:read')
  @ApiOperation({ summary: 'Live biometric punch feed (poll)' })
  liveFeed(
    @Req() req: TenantRequest,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit != null ? Number(limit) : 50;
    return this.mappingService.listLiveFeed(
      req.tenantDataSource!,
      req.organization!.id,
      since,
      Number.isFinite(n) ? n : 50,
    );
  }
}
