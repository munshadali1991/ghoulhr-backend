import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { EssSkillsService } from './ess-skills.service';
import {
  CreateEmployeeSkillDto,
  UpdateEmployeeSkillDto,
} from './dto/employee-skill.dto';

@ApiTags('ESS Skills')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('ess/skills')
export class EssSkillsController {
  constructor(private readonly essSkillsService: EssSkillsService) {}

  @Get('catalog')
  @RequirePermissions('ess.skills:read')
  @ApiOperation({ summary: 'Active skill catalog for employee pickers' })
  getCatalog(@Req() req: TenantRequest) {
    return this.essSkillsService.getCatalog(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Get()
  @RequirePermissions('ess.skills:read')
  @ApiOperation({ summary: 'List my assigned skills' })
  listMySkills(@Req() req: TenantRequest) {
    return this.essSkillsService.listMySkills(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
    );
  }

  @Post()
  @RequirePermissions('ess.skills:write')
  @ApiOperation({ summary: 'Add a skill to my profile' })
  async addSkill(
    @Req() req: TenantRequest,
    @Body() dto: CreateEmployeeSkillDto,
  ) {
    const skill = await this.essSkillsService.addSkill(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      dto,
    );
    return { message: 'Skill added successfully', skill };
  }

  @Put(':id')
  @RequirePermissions('ess.skills:write')
  @ApiOperation({ summary: 'Update experience and proficiency for my skill' })
  async updateSkill(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeSkillDto,
  ) {
    const skill = await this.essSkillsService.updateSkill(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
      dto,
    );
    return { message: 'Skill updated successfully', skill };
  }

  @Delete(':id')
  @RequirePermissions('ess.skills:write')
  @ApiOperation({ summary: 'Remove a skill from my profile' })
  async removeSkill(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.essSkillsService.removeSkill(
      req.tenantDataSource!,
      req.organization!.id,
      req.user!.sub,
      id,
    );
    return { message: 'Skill removed successfully' };
  }
}
