import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { ExpenseClaim } from './expense-claim.entity';

export enum ExpenseClaimAuditAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  SUBMITTED = 'SUBMITTED',
  MANAGER_APPROVED = 'MANAGER_APPROVED',
  FINANCE_APPROVED = 'FINANCE_APPROVED',
  SENT_BACK = 'SENT_BACK',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  MARKED_PAID = 'MARKED_PAID',
  EXPORTED = 'EXPORTED',
  LINE_ADDED = 'LINE_ADDED',
  LINE_UPDATED = 'LINE_UPDATED',
  LINE_REMOVED = 'LINE_REMOVED',
}

@Entity({ name: 'expense_claim_audit_logs' })
@Index(['claimId', 'createdAt'])
export class ExpenseClaimAuditLog extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  claimId: string;

  @ManyToOne(() => ExpenseClaim, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claimId' })
  claim?: ExpenseClaim;

  @Column({ length: 64 })
  action: ExpenseClaimAuditAction;

  @Column({ type: 'uuid', nullable: true })
  actorEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actorEmployeeId' })
  actor?: Employee;

  @Column({ length: 32, nullable: true })
  fromStatus?: string | null;

  @Column({ length: 32, nullable: true })
  toStatus?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payloadJson?: Record<string, unknown> | null;
}
