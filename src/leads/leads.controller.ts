import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthTokenGuard } from '../auth/guards/auth-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../roles/roles.enum';
import { LeadsService } from './leads.service';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { PaginatedLeadsDto } from './dto/lead-item.dto';

@ApiTags('Leads')
@ApiBearerAuth('bearer')
@Controller('leads')
@UseGuards(AuthTokenGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({
    summary: 'List marketing leads from contact us and demo requests',
  })
  @ApiResponse({ status: 200, type: PaginatedLeadsDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid bearer token' })
  @ApiResponse({ status: 403, description: 'Role forbidden' })
  list(@Query() query: ListLeadsQueryDto): Promise<PaginatedLeadsDto> {
    return this.leadsService.listLeads(query);
  }
}
