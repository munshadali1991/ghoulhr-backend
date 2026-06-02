import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GetLeaveTransactionsQueryDto {
  @ApiProperty({ example: '2026-05-20' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ enum: ['me', 'team'], default: 'me' })
  @IsOptional()
  @IsIn(['me', 'team'])
  filter?: 'me' | 'team';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
