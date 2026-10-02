import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadSource } from '../lead-source.enum';

export class LeadItemDto {
  @ApiProperty({ example: 'contact_us:12' })
  id: string;

  @ApiProperty({ enum: [LeadSource.CONTACT_US, LeadSource.REQUEST_FOR_DEMO] })
  source: LeadSource.CONTACT_US | LeadSource.REQUEST_FOR_DEMO;

  @ApiProperty({ example: '12' })
  sourceId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiPropertyOptional({ nullable: true })
  phone: string | null;

  @ApiProperty()
  company: string;

  @ApiPropertyOptional({ nullable: true })
  companySize: string | null;

  @ApiPropertyOptional({ nullable: true })
  companyType: string | null;

  @ApiPropertyOptional({ nullable: true })
  message: string | null;

  @ApiPropertyOptional({ nullable: true })
  contact: string | null;

  @ApiPropertyOptional({ nullable: true })
  mobile: string | null;

  @ApiPropertyOptional({ nullable: true })
  address: string | null;

  @ApiPropertyOptional({ nullable: true })
  country: string | null;

  @ApiPropertyOptional({ nullable: true })
  city: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class LeadCountsDto {
  @ApiProperty()
  all: number;

  @ApiProperty()
  contactUs: number;

  @ApiProperty()
  requestForDemo: number;
}

export class PaginatedLeadsDto {
  @ApiProperty({ type: [LeadItemDto] })
  items: LeadItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty({ type: LeadCountsDto })
  counts: LeadCountsDto;
}
