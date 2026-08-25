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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { SubscriptionGuard } from '../subscriptions/guards/subscription.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator';
import type { TenantRequest } from '../common/middleware/tenant-resolver.middleware';
import { SkillMasterService } from './skill-master.service';
import {
  CreateSkillCategoryDto,
  CreateSkillDto,
  CreateSkillSubcategoryDto,
  ListSkillSubcategoriesQueryDto,
  ListSkillsQueryDto,
  UpdateSkillCategoryDto,
  UpdateSkillDto,
  UpdateSkillSubcategoryDto,
} from './dto/skill-master.dto';

@ApiTags('Settings Skills')
@ApiBearerAuth()
@UseGuards(TenantAuthGuard, SubscriptionGuard, PermissionsGuard)
@Controller('settings/skills')
export class SkillMasterController {
  constructor(private readonly skillMasterService: SkillMasterService) {}

  @Get('categories')
  @RequirePermissions('settings.skills:read')
  @ApiOperation({ summary: 'List skill categories' })
  listCategories(@Req() req: TenantRequest) {
    return this.skillMasterService.listCategories(
      req.tenantDataSource!,
      req.organization!.id,
    );
  }

  @Post('categories')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Create a skill category' })
  async createCategory(
    @Req() req: TenantRequest,
    @Body() dto: CreateSkillCategoryDto,
  ) {
    const category = await this.skillMasterService.createCategory(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
    return { message: 'Category created successfully', category };
  }

  @Put('categories/:id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Update a skill category' })
  async updateCategory(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillCategoryDto,
  ) {
    const category = await this.skillMasterService.updateCategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
    return { message: 'Category updated successfully', category };
  }

  @Delete('categories/:id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Soft-delete a skill category' })
  async deleteCategory(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.skillMasterService.deleteCategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
    return { message: 'Category deleted successfully' };
  }

  @Get('subcategories')
  @RequirePermissions('settings.skills:read')
  @ApiOperation({ summary: 'List skill subcategories' })
  listSubcategories(
    @Req() req: TenantRequest,
    @Query() query: ListSkillSubcategoriesQueryDto,
  ) {
    return this.skillMasterService.listSubcategories(
      req.tenantDataSource!,
      req.organization!.id,
      query,
    );
  }

  @Post('subcategories')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Create a skill subcategory' })
  async createSubcategory(
    @Req() req: TenantRequest,
    @Body() dto: CreateSkillSubcategoryDto,
  ) {
    const subcategory = await this.skillMasterService.createSubcategory(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
    return { message: 'Subcategory created successfully', subcategory };
  }

  @Put('subcategories/:id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Update a skill subcategory' })
  async updateSubcategory(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillSubcategoryDto,
  ) {
    const subcategory = await this.skillMasterService.updateSubcategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
    return { message: 'Subcategory updated successfully', subcategory };
  }

  @Delete('subcategories/:id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Soft-delete a skill subcategory' })
  async deleteSubcategory(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.skillMasterService.deleteSubcategory(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
    return { message: 'Subcategory deleted successfully' };
  }

  @Get('items')
  @RequirePermissions('settings.skills:read')
  @ApiOperation({ summary: 'List skills' })
  listSkills(@Req() req: TenantRequest, @Query() query: ListSkillsQueryDto) {
    return this.skillMasterService.listSkills(
      req.tenantDataSource!,
      req.organization!.id,
      query,
    );
  }

  @Post('items')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Create a skill' })
  async createSkill(@Req() req: TenantRequest, @Body() dto: CreateSkillDto) {
    const skill = await this.skillMasterService.createSkill(
      req.tenantDataSource!,
      req.organization!.id,
      dto,
    );
    return { message: 'Skill created successfully', skill };
  }

  @Put(':id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Update a skill' })
  async updateSkill(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkillDto,
  ) {
    const skill = await this.skillMasterService.updateSkill(
      req.tenantDataSource!,
      req.organization!.id,
      id,
      dto,
    );
    return { message: 'Skill updated successfully', skill };
  }

  @Delete(':id')
  @RequirePermissions('settings.skills:write')
  @ApiOperation({ summary: 'Soft-delete a skill' })
  async deleteSkill(
    @Req() req: TenantRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.skillMasterService.deleteSkill(
      req.tenantDataSource!,
      req.organization!.id,
      id,
    );
    return { message: 'Skill deleted successfully' };
  }
}
