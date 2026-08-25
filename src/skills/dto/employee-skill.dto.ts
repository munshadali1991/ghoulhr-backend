import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsUUID, Max, Min } from 'class-validator';
import {
  MAX_SKILL_EXPERIENCE_MONTHS,
  SkillProficiency,
} from '../enums/skill-proficiency.enum';

export class CreateEmployeeSkillDto {
  @ApiProperty()
  @IsUUID()
  skillId: string;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_SKILL_EXPERIENCE_MONTHS)
  experienceMonths: number;

  @ApiProperty({ enum: SkillProficiency, example: SkillProficiency.GOOD })
  @IsEnum(SkillProficiency)
  proficiency: SkillProficiency;
}

export class UpdateEmployeeSkillDto {
  @ApiPropertyOptional({ example: 24 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_SKILL_EXPERIENCE_MONTHS)
  experienceMonths: number;

  @ApiPropertyOptional({ enum: SkillProficiency })
  @IsEnum(SkillProficiency)
  proficiency: SkillProficiency;
}
