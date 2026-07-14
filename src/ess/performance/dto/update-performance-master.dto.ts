import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PerformanceRatingOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(64)
  label: string;

  @IsInt()
  @Min(0)
  weight: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PerformanceQuestionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(64)
  key: string;

  @IsString()
  label: string;

  @IsString()
  @MaxLength(32)
  type: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  allowComment?: boolean;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsString()
  helperText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  placeholder?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PerformanceSectionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MaxLength(64)
  key: string;

  @IsString()
  @MaxLength(191)
  title: string;

  @IsOptional()
  @IsString()
  banner?: string | null;

  @IsString()
  @MaxLength(64)
  role: string;

  @IsBoolean()
  scored: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceQuestionDto)
  questions: PerformanceQuestionDto[];
}

export class UpdatePerformanceMasterDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceSectionDto)
  sections: PerformanceSectionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceRatingOptionDto)
  ratingOptions: PerformanceRatingOptionDto[];
}
