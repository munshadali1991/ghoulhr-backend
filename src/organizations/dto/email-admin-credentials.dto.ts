import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmailAdminCredentialsDto {
  @ApiProperty({
    description: 'Temporary password shown after regenerate (sent in email)',
    example: 'Abcd1234!@#$Efgh',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  temporaryPassword: string;
}
