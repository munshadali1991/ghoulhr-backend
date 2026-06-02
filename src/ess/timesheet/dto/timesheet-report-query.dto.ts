import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class TimesheetReportQueryDto {
  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  @IsIn(['daily', 'weekly', 'monthly'])
  granularity: 'daily' | 'weekly' | 'monthly';

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  to: string;

  @ApiProperty({ required: false, example: 2026 })
  @IsOptional()
  year?: number;

  @ApiProperty({ required: false, example: 6 })
  @IsOptional()
  month?: number;
}
