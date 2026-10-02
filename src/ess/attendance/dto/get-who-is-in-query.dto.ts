import { IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetWhoIsInQueryDto {
  @ApiPropertyOptional({
    description: 'Work date YYYY-MM-DD (defaults to org-local today)',
    example: '2026-08-20',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be YYYY-MM-DD',
  })
  date?: string;
}
