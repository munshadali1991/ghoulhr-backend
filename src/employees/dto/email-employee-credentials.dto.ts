import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmailEmployeeCredentialsDto {
  @ApiProperty({
    description: 'Temporary password shown after regenerate/create',
    example: 'Abcd1234!@#$Efgh',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  temporaryPassword: string;
}
