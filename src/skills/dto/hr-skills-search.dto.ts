import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_SKILL_EXPERIENCE_MONTHS,
  SkillProficiency,
} from '../enums/skill-proficiency.enum';

export class SearchHrSkillsQueryDto {
  @ApiPropertyOptional({ description: 'Employee name or employee code' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  skillId?: string;

  @ApiPropertyOptional({ enum: SkillProficiency })
  @IsOptional()
  @IsEnum(SkillProficiency)
  proficiency?: SkillProficiency;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_SKILL_EXPERIENCE_MONTHS)
  minExperienceMonths?: number;
}
