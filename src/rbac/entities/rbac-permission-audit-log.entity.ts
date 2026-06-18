import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'rbac_permission_audit_logs' })
export class RbacPermissionAuditLog extends BaseEntity {
  @Column()
  action: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  actorEmployeeId?: string;

  @Column({ type: 'varchar', nullable: true })
  targetType?: string;

  @Column({ type: 'uuid', nullable: true })
  targetId?: string;

  @Column({ type: 'jsonb', nullable: true })
  before?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  after?: Record<string, unknown>;
}
