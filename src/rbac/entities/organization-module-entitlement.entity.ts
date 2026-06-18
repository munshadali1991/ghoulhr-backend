import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Organization } from '../../organizations/organization.entity';

@Entity({ name: 'organization_module_entitlements' })
@Unique(['organizationId', 'moduleCode'])
export class OrganizationModuleEntitlement extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;

  @Column()
  @Index()
  moduleCode: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  enabledAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  enabledBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;
}
