import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TimesheetPriority, TimesheetTaskStatus } from '../../entities/timesheet-entry.entity';

export class TimesheetEntryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'peopleAIQ Platform' })
  @IsString()
  @MaxLength(120)
  projectName: string;

  @ApiProperty({ example: 'Timesheet API' })
  @IsString()
  @MaxLength(200)
  taskName: string;

  @ApiProperty({ example: 'Implemented day CRUD endpoints' })
  @IsString()
  @MaxLength(2000)
  taskDescription: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @Min(0.25)
  @Max(24)
  hoursSpent: number;

  @ApiProperty({ enum: TimesheetTaskStatus })
  @IsEnum(TimesheetTaskStatus)
  taskStatus: TimesheetTaskStatus;

  @ApiProperty({ enum: TimesheetPriority })
  @IsEnum(TimesheetPriority)
  priority: TimesheetPriority;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  blockerNotes?: string;
}
