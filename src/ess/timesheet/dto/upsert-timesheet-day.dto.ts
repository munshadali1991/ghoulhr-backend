import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { TimesheetDayStatus } from '../../entities/timesheet-day.entity';
import { TimesheetEntryDto } from './timesheet-entry.dto';

export class UpsertTimesheetDayDto {
  @ApiProperty({ enum: [TimesheetDayStatus.DRAFT, TimesheetDayStatus.SUBMITTED] })
  @IsEnum(TimesheetDayStatus)
  status: TimesheetDayStatus;

  @ApiProperty({ type: [TimesheetEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryDto)
  entries: TimesheetEntryDto[];
}

export class SubmitTimesheetDayDto {
  @ApiProperty({ type: [TimesheetEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryDto)
  entries: TimesheetEntryDto[];
}
