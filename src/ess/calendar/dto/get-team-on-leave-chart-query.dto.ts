import { Type } from 'class-transformer';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetTeamOnLeaveChartQueryDto {
  @ApiProperty({ example: '2026-08-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;

  @ApiPropertyOptional({
    enum: ['leave', 'holiday', 'all'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['leave', 'holiday', 'all'])
  type?: 'leave' | 'holiday' | 'all';
}
