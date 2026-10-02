import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExpenseCategoryItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'TRAVEL' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: 'Travel' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '0' })
  @IsOptional()
  @IsNumberString()
  receiptRequiredAboveAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  maxAmountPerLine?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  claimWindowDays?: number | null;
}

export class UpdateExpenseCategoriesDto {
  @ApiProperty({ type: [ExpenseCategoryItemDto] })
  @ValidateNested({ each: true })
  @Type(() => ExpenseCategoryItemDto)
  categories: ExpenseCategoryItemDto[];
}

export class UpdateExpensePolicyDto {
  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  defaultClaimWindowDays?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxLinesPerClaim?: number;

  @ApiPropertyOptional({ example: '500000' })
  @IsOptional()
  @IsNumberString()
  maxClaimAmount?: string;
}
