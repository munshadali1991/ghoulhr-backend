import { Entity, Column, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../database/base.entity';
import { OrganizationStatus } from './organization-status.enum';

@Entity('organizations')
export class Organization extends BaseEntity {
  @ApiProperty({ example: 'Acme Corporation' })
  @Column()
  name: string;

  @ApiProperty({ example: 'acme' })
  @Index({ unique: true })
  @Column()
  subdomain: string;

  @ApiProperty({ enum: OrganizationStatus, default: OrganizationStatus.ACTIVE })
  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;

  @Column({ nullable: true })
  shortName?: string;

  @Column({ nullable: true })
  industryType?: string;

  @Column({ nullable: true })
  organizationType?: string;

  @Column({ type: 'date', nullable: true })
  dateOfIncorporation?: string;

  @Column({ nullable: true })
  companyLogo?: string;

  @Column({ nullable: true })
  websiteUrl?: string;

  @Column({ nullable: true })
  timeZone?: string;

  @Column({ nullable: true })
  financialYearStartMonth?: string;

  @Column({ type: 'text', nullable: true })
  registeredOfficeAddress?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  pinCode?: string;

  @Column({ nullable: true })
  contactNumber?: string;

  @Column({ nullable: true })
  officialEmail?: string;

  @Column({ nullable: true })
  panNumber?: string;

  @Column({ nullable: true })
  tanNumber?: string;

  @Column({ nullable: true })
  gstin?: string;

  @Column({ nullable: true })
  pfEstablishmentCode?: string;

  @Column({ nullable: true })
  esiCode?: string;

  @Column({ nullable: true })
  professionalTaxRegistrationNumber?: string;

  @Column({ type: 'text', nullable: true })
  labourWelfareFundDetails?: string;

  @Column({ nullable: true })
  cinNumber?: string;

  @Column({ nullable: true })
  salaryStructureTemplate?: string;

  @Column({ type: 'text', nullable: true })
  defaultEarningsAndDeductions?: string;

  @Column({ nullable: true })
  pfEsiApplicability?: string;

  @Column({ type: 'text', nullable: true })
  tdsSettings?: string;

  @Column({ type: 'text', nullable: true })
  bankDetailsForSalaryProcessing?: string;

  @Column({ nullable: true })
  payCycle?: string;

  @Column({ nullable: true })
  salaryDisbursementDate?: string;

  @Column({ nullable: true })
  adminName?: string;

  @Column({ nullable: true })
  adminEmail?: string;

  @Column({ nullable: true })
  adminMobileNumber?: string;

  @Column({ type: 'text', nullable: true })
  adminRolePermissions?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({ nullable: true })
  branchName?: string;

  @Column({ nullable: true })
  ifscCode?: string;

  @Column({ nullable: true })
  accountNumber?: string;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number) => value ?? 0,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  monthlySubscriptionAmount: number;
}
