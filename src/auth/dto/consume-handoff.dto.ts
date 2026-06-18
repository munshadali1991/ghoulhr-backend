import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ConsumeHandoffDto {
  @ApiProperty({ description: 'One-time handoff code from login redirect' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
