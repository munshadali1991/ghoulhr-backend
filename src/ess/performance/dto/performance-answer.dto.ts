import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PerformanceAnswerDto {
  @ApiProperty({ example: 'q1_roles' })
  @IsString()
  @MaxLength(64)
  questionKey: string;

  @ApiProperty({ required: false, example: 'qualitative' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

  @ApiProperty({ required: false, example: 'narrative' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  answerType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  valueText?: string;

  @ApiProperty({ required: false, example: 'OUTSTANDING' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  valueRating?: string;

  @ApiProperty({ required: false, example: 12 })
  @IsOptional()
  @IsNumber()
  valueNumber?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}
