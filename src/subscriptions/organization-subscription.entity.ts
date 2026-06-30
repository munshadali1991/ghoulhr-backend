import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '../database/base.entity';
import { Organization } from '../organizations/organization.entity';
import { SubscriptionType } from './subscription-type.enum';
import { SubscriptionStatus } from './subscription-status.enum';

@Entity('organization_subscriptions')
@Index(['organizationId'])
export class OrganizationSubscription extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'uuid' })
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;

  @ApiProperty({ enum: SubscriptionType })
  @Column({
    type: 'enum',
    enum: SubscriptionType,
  })
  subscriptionType: SubscriptionType;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @ApiProperty()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @ApiProperty({ enum: SubscriptionStatus })
  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @ApiPropertyOptional()
  @Column({ type: 'uuid', nullable: true })
  createdByUserId?: string;

  @ApiPropertyOptional()
  @Column({ type: 'text', nullable: true })
  notes?: string;
}
