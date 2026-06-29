import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { TimesheetDayStatus } from '../../entities/timesheet-day.entity';

/** Display statuses for manager team view (PENDING is virtual: missing or DRAFT). */
export const TEAM_TIMESHEET_DISPLAY_STATUSES = [
  'PENDING',
  ...Object.values(TimesheetDayStatus),
] as const;

export type TeamTimesheetDisplayStatus =
  (typeof TEAM_TIMESHEET_DISPLAY_STATUSES)[number];

export class TeamTimesheetQueryDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  to: string;

  @ApiProperty({ required: false, enum: TEAM_TIMESHEET_DISPLAY_STATUSES })
  @IsOptional()
  @IsIn([...TEAM_TIMESHEET_DISPLAY_STATUSES])
  status?: TeamTimesheetDisplayStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
