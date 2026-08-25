import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export const SIGN_IN_LOCATIONS = [
  'WORK_FROM_OFFICE',
  'WORK_FROM_HOME',
  'CLIENT_LOCATION',
] as const;

export type SignInLocationCode = (typeof SIGN_IN_LOCATIONS)[number];

export const SIGN_IN_LOCATION_LABELS: Record<SignInLocationCode, string> = {
  WORK_FROM_OFFICE: 'Work From Office',
  WORK_FROM_HOME: 'Work from Home',
  CLIENT_LOCATION: 'Client Location',
};

/** Body for sign-out (GPS only). */
export class SignPunchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;
}

/** Body for sign-in (GPS + required work location). */
export class SignInPunchDto extends SignPunchDto {
  @ApiProperty({
    enum: SIGN_IN_LOCATIONS,
    example: 'WORK_FROM_HOME',
  })
  @IsString()
  @IsIn([...SIGN_IN_LOCATIONS])
  signInLocation!: SignInLocationCode;
}
