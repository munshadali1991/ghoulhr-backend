import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { PerformanceAnswerDto } from './performance-answer.dto';

/**
 * Shared payload for manager and HR review submissions.
 * `complete` marks the assessment as reviewed/completed for that stage.
 */
export class ReviewAssessmentDto {
  @ApiProperty({ type: [PerformanceAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceAnswerDto)
  answers: PerformanceAnswerDto[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
