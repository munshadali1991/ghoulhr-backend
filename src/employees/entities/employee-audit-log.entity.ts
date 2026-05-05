import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity('employee_audit_logs')
export class EmployeeAuditLog extends BaseEntity {
  @ManyToOne(() => Employee, (e) => e.auditLogs, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee | null;

  @Column({ type: 'uuid' })
  actorId: string;

  @Column()
  action: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;
}
