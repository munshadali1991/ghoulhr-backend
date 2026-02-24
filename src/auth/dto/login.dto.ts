import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'employee@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Passw0rd!23' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
