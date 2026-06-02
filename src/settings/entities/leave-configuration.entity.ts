import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { LocationConfiguration } from '../../employees/entities/location-configuration.entity';

@Entity({ name: 'leave_configurations' })
@Index(['organizationId', 'locationId', 'sortOrder'])
export class LeaveConfiguration extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string | null;

  @Column({ type: 'uuid' })
  @Index()
  locationId: string;

  @ManyToOne(() => LocationConfiguration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locationId' })
  location?: LocationConfiguration;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 32, nullable: true })
  code?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ length: 64, nullable: true })
  leaveCategory?: string | null;

  @Column({ length: 32, default: 'MONTHLY' })
  accrualType: string;

  @Column({ type: 'boolean', default: false })
  encashmentAllowed: boolean;

  @Column({ type: 'boolean', default: false })
  negativeBalanceAllowed: boolean;

  @Column({ type: 'int', nullable: true })
  supportingDocumentAfterDays?: number | null;

  @Column({ type: 'int', nullable: true })
  maxConsecutiveDays?: number | null;

  @Column({ type: 'boolean', default: false })
  weekendsCountAsLeave: boolean;

  @Column({ type: 'boolean', default: false })
  holidaysCountAsLeave: boolean;

  @Column({ type: 'jsonb', nullable: true })
  approvalWorkflow?: string[] | null;

  @Column({ length: 32, default: 'ALL_EMPLOYEES' })
  appliesTo: string;

  @Column({ type: 'boolean', default: true })
  isPaid: boolean;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  annualEntitlementDays: string;

  @Column({ type: 'boolean', default: false })
  allowCarryForward: boolean;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  maxCarryForwardDays?: string | null;

  @Column({ type: 'boolean', default: true })
  requiresApproval: boolean;

  @Column({ type: 'boolean', default: false })
  requiresSupportingDocument: boolean;

  @Column({ type: 'boolean', default: true })
  allowHalfDay: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
