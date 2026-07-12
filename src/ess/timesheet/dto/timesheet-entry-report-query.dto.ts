import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class TimesheetEntryReportQueryDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  to: string;
}
