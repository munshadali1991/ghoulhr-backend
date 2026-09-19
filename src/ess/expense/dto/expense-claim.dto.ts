import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseClaimDto {
  @ApiProperty({ example: 'Client visit travel' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;

  @ApiPropertyOptional({ example: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;
}

export class UpdateExpenseClaimDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;
}

export class ExpenseReceiptDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  documentType: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty()
  @IsString()
  @MaxLength(128)
  mimeType: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sizeBytes: number;

  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  storageKey: string;
}

export class CreateExpenseClaimLineDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsString()
  @MaxLength(10)
  expenseDate: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  merchant: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description: string;

  @ApiProperty({ example: '1250.00' })
  @IsString()
  @MaxLength(20)
  amount: string;

  @ApiPropertyOptional({ type: ExpenseReceiptDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpenseReceiptDto)
  receipt?: ExpenseReceiptDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  receiptDocumentId?: string;
}

export class UpdateExpenseClaimLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  expenseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  merchant?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string;

  @ApiPropertyOptional({ type: ExpenseReceiptDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpenseReceiptDto)
  receipt?: ExpenseReceiptDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  receiptDocumentId?: string;
}

export class SendBackExpenseDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason: string;
}

export class MarkExpensePaidDto {
  @ApiProperty({ example: '2026-09-19' })
  @IsString()
  @MaxLength(10)
  paidAt: string;

  @ApiProperty({ example: 'UTR123456789' })
  @IsString()
  @MinLength(3)
  @MaxLength(128)
  paymentReference: string;

  @ApiProperty({ enum: ['BANK', 'UPI', 'CHEQUE', 'OTHER'] })
  @IsString()
  @MaxLength(32)
  paymentMode: string;
}
