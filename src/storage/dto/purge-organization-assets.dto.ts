import { ApiProperty } from '@nestjs/swagger';
import { IsString, Equals } from 'class-validator';

export const PURGE_ASSETS_CONFIRM_PHRASE = 'DELETE ALL ASSETS';

export class PurgeOrganizationAssetsDto {
  @ApiProperty({
    example: PURGE_ASSETS_CONFIRM_PHRASE,
    description: 'Type exactly DELETE ALL ASSETS to confirm irreversible purge',
  })
  @IsString()
  @Equals(PURGE_ASSETS_CONFIRM_PHRASE)
  confirm: string;
}
