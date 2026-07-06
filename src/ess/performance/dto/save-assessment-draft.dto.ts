import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { PerformanceAnswerDto } from './performance-answer.dto';

export class SaveAssessmentDraftDto {
  @ApiProperty({ type: [PerformanceAnswerDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PerformanceAnswerDto)
  answers: PerformanceAnswerDto[];
}
