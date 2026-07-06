import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAssessmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({ example: 'annual-review-v1', default: 'annual-review-v1' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateKey?: string;

  @ApiProperty({ example: 'Annual Performance Review - April 2026' })
  @IsString()
  @MaxLength(191)
  cycleLabel: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @ApiProperty({ required: false, example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  alignManagerEmployeeId?: string;
}
