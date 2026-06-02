import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListReportingManagersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['all', 'unassigned'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'unassigned'])
  filter?: 'all' | 'unassigned' = 'all';
}
