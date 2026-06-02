import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateTimesheetSettingsDto {
  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  max_hours_per_day?: number;

  @ApiProperty({ example: 7, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  max_past_days?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  require_submission_by_eod?: boolean;

  @ApiProperty({ example: 'Log your daily work before end of day.', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  employee_helper_text?: string;

  @ApiProperty({
    example: 1,
    description: '0 = Sunday, 1 = Monday (default)',
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  week_starts_on?: number;
}
