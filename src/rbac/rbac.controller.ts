import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { RequirePermissions } from './decorators/require-permissions.decorator';
import { RbacAdminService } from './rbac-admin.service';
import { AccessScope } from './constants/access-scope.enum';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import {
  AssignEmployeeRolesDto,
  CloneRoleDto,
  CreateRoleDto,
  ListAuditLogsQueryDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
} from './dto/rbac.dto';

@ApiTags('RBAC')
@ApiBearerAuth()
@Controller('rbac')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class RbacController {
  constructor(private readonly rbacAdminService: RbacAdminService) {}

  @Get('roles')
  @RequirePermissions('rbac:read')
  @ApiOperation({ summary: 'List tenant roles with counts and flags' })
  listRoles(@Req() req: TenantRequest) {
    return this.rbacAdminService.listRoles(req.tenantDataSource!);
  }

  @Post('roles')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Create a custom role' })
  createRole(@Req() req: TenantRequest, @Body() dto: CreateRoleDto) {
    return this.rbacAdminService.createRole(
      req.tenantDataSource!,
      req.organization!.id,
      dto.name,
      dto.description,
      req.user!.sub,
    );
  }

  @Get('permissions')
  @RequirePermissions('rbac:read')
  @ApiOperation({ summary: 'List permissions available for entitled modules' })
  listPermissions(@Req() req: TenantRequest) {
    return this.rbacAdminService.listPermissions(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get('roles/:id')
  @RequirePermissions('rbac:read')
  @ApiOperation({ summary: 'Get role with permissions' })
  getRole(@Req() req: TenantRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.rbacAdminService.getRoleDetail(
      req.tenantDataSource!,
      id,
      req.organization!.id,
    );
  }

  @Patch('roles/:id')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Update custom role name/description' })
  updateRole(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rbacAdminService.updateRole(
      req.tenantDataSource!,
      id,
      req.organization!.id,
      dto,
      req.user!.sub,
    );
  }

  @Patch('roles/:id/deactivate')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Deactivate a custom role' })
  deactivateRole(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rbacAdminService.deactivateRole(
      req.tenantDataSource!,
      id,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Post('roles/:id/clone')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Clone a role with its permissions' })
  cloneRole(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneRoleDto,
  ) {
    return this.rbacAdminService.cloneRole(
      req.tenantDataSource!,
      id,
      req.organization!.id,
      dto.name,
      dto.description,
      req.user!.sub,
    );
  }

  @Patch('roles/:id/permissions')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Update role permissions' })
  updateRolePermissions(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    const entries =
      dto.permissions?.map((p) => ({
        permissionCode: p.permissionCode,
        accessScope: p.accessScope,
      })) ??
      dto.permissionCodes?.map((code) => ({
        permissionCode: code,
        accessScope: AccessScope.SELF,
      }));

    if (!entries?.length) {
      throw new BadRequestException(
        'Provide permissions (with optional accessScope) or permissionCodes',
      );
    }

    return this.rbacAdminService.updateRolePermissions(
      req.tenantDataSource!,
      id,
      req.organization!.id,
      entries,
      req.user!.sub,
    );
  }

  @Get('employees/:employeeId/roles')
  @RequirePermissions('rbac:read')
  @ApiOperation({ summary: 'List employee role assignments' })
  getEmployeeRoles(
    @Req() req: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.rbacAdminService.listEmployeeAssignments(
      req.tenantDataSource!,
      employeeId,
    );
  }

  @Patch('employees/:employeeId/roles')
  @RequirePermissions('rbac:manage')
  @ApiOperation({ summary: 'Assign roles to employee' })
  assignEmployeeRoles(
    @Req() req: TenantRequest,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: AssignEmployeeRolesDto,
  ) {
    return this.rbacAdminService.assignEmployeeRoles(
      req.tenantDataSource!,
      employeeId,
      dto.roleIds,
      req.user!.sub,
      dto.primaryRoleId,
    );
  }

  @Get('audit-logs')
  @RequirePermissions('rbac:read')
  @ApiOperation({ summary: 'List RBAC audit logs with pagination' })
  listAuditLogs(
    @Req() req: TenantRequest,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.rbacAdminService.listAuditLogs(req.tenantDataSource!, query);
  }
}
