import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveApprovalDto {
  @ApiPropertyOptional({ description: 'Optional notes from the approver' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
