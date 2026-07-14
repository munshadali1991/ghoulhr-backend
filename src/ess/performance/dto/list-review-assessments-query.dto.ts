import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PerformanceAssessmentStatus } from '../../entities/performance-assessment.entity';

export class ListReviewAssessmentsQueryDto {
  @ApiProperty({ required: false, enum: PerformanceAssessmentStatus })
  @IsOptional()
  @IsIn(Object.values(PerformanceAssessmentStatus))
  status?: PerformanceAssessmentStatus;

  @ApiProperty({ required: false, description: 'Filter by cycle label or employee name/code' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  search?: string;
}
