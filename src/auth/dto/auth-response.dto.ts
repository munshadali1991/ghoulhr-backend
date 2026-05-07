import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../roles/roles.enum';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ example: 'acme' })
  organizationSubdomain: string;

  @ApiProperty({ example: 'admin@acme.com' })
  email: string;

  @ApiProperty({ enum: Role })
  role: Role;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  @ApiPropertyOptional({
    description:
      'Deprecated: access and refresh tokens are issued as HttpOnly cookies on the API host.',
  })
  accessToken?: string;
}
