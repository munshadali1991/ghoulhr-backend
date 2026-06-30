import { IsEnum, IsNotEmpty, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionType } from '../subscription-type.enum';

export class CreateSubscriptionDto {
  @ApiProperty({ enum: SubscriptionType, example: SubscriptionType.MONTHLY })
  @IsEnum(SubscriptionType)
  subscriptionType: SubscriptionType;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  @IsNotEmpty()
  startsAt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
