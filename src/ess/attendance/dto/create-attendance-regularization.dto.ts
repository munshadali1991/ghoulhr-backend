import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { HH_MM_PATTERN } from '../regularization-time.util';

export class CreateAttendanceRegularizationDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  workDate: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(HH_MM_PATTERN, { message: 'inTime must be HH:mm' })
  inTime: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(HH_MM_PATTERN, { message: 'outTime must be HH:mm' })
  outTime: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  reason: string;
}
