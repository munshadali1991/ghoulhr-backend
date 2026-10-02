import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

@Entity({ name: 'biometric_audit_logs' })
@Index(['organizationId', 'createdAt'])
export class BiometricAuditLog extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  actorEmployeeId?: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorEmployeeId' })
  actor?: Employee | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entityType?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entityId?: string | null;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  beforeJson?: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  afterJson?: Record<string, unknown> | null;
}
