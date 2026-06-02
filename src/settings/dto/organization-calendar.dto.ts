import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CalendarHolidayType } from '../entities/organization-calendar-holiday.entity';

export class GetOrganizationCalendarQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}

export class CreateCalendarHolidayDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ example: '2026-01-26' })
  @IsDateString()
  holidayDate: string;

  @ApiProperty()
  @IsString()
  @MaxLength(191)
  name: string;

  @ApiProperty({ enum: CalendarHolidayType })
  @IsEnum(CalendarHolidayType)
  holidayType: CalendarHolidayType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class UpdateCalendarHolidayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  holidayDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @ApiPropertyOptional({ enum: CalendarHolidayType })
  @IsOptional()
  @IsEnum(CalendarHolidayType)
  holidayType?: CalendarHolidayType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string | null;
}

export class PublishOrganizationCalendarDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;
}
