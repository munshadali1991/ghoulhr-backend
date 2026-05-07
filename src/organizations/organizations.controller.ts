import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuthTokenGuard } from '../auth/guards/auth-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../roles/roles.enum';
import { Organization } from './organization.entity';

@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@Controller('organizations')
@UseGuards(AuthTokenGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an organization tenant' })
  @ApiBody({ type: CreateOrganizationDto })
  @ApiResponse({ status: 201, type: Organization })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Role forbidden' })
  @ApiResponse({ status: 409, description: 'Subdomain already exists' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all organizations' })
  @ApiResponse({ status: 200, type: Organization, isArray: true })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Role forbidden' })
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Super admin dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Aggregated super admin metrics' })
  getDashboardStats() {
    return this.organizationsService.getSuperAdminStats();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Super admin dashboard statistics (alias)' })
  @ApiResponse({ status: 200, description: 'Aggregated super admin metrics' })
  getDashboardStatsAlias() {
    return this.organizationsService.getSuperAdminStats();
  }

  @Get('deleted')
  @ApiOperation({ summary: 'List soft-deleted organizations' })
  @ApiResponse({ status: 200, type: Organization, isArray: true })
  findDeleted() {
    return this.organizationsService.findDeleted();
  }

  @Patch('id/:id')
  @ApiOperation({ summary: 'Update organization by id' })
  @ApiParam({ name: 'id' })
  @ApiBody({ type: UpdateOrganizationDto })
  @ApiResponse({ status: 200, type: Organization })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(id, dto);
  }

  @Delete('id/:id')
  @ApiOperation({ summary: 'Delete organization by id' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Organization deleted' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  remove(@Param('id') id: string) {
    return this.organizationsService.remove(id);
  }

  @Patch('id/:id/restore')
  @ApiOperation({ summary: 'Restore soft-deleted organization by id' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Organization restored' })
  @ApiResponse({ status: 404, description: 'Deleted organization not found' })
  restore(@Param('id') id: string) {
    return this.organizationsService.restore(id);
  }

  @Get('id/:id')
  @ApiOperation({ summary: 'Find organization by id' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, type: Organization })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  findById(@Param('id') id: string) {
    return this.organizationsService.findById(id);
  }

  @Get(':subdomain')
  @ApiOperation({ summary: 'Find organization by subdomain' })
  @ApiParam({ name: 'subdomain', example: 'acme' })
  @ApiResponse({ status: 200, type: Organization })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Role forbidden' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  findBySubdomain(@Param('subdomain') subdomain: string) {
    return this.organizationsService.findBySubdomain(subdomain);
  }
}
