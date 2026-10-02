import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

export enum ExpenseClaimStatus {
  DRAFT = 'DRAFT',
  PENDING_MANAGER = 'PENDING_MANAGER',
  PENDING_FINANCE = 'PENDING_FINANCE',
  SENT_BACK = 'SENT_BACK',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum ExpensePaymentMode {
  BANK = 'BANK',
  UPI = 'UPI',
  CHEQUE = 'CHEQUE',
  OTHER = 'OTHER',
}

@Entity({ name: 'expense_claims' })
@Index(['organizationId', 'employeeId', 'status'])
@Index(['managerEmployeeId', 'status'])
@Index(['organizationId', 'status'])
export class ExpenseClaim extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ length: 32 })
  claimNumber: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  purpose?: string | null;

  @Column({ length: 32, default: ExpenseClaimStatus.DRAFT })
  status: ExpenseClaimStatus;

  @Column({ length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalAmount: string;

  @Column({ type: 'uuid', nullable: true })
  managerEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerEmployeeId' })
  manager?: Employee;

  @Column({ type: 'timestamptz', nullable: true })
  managerActionAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  managerNotes?: string | null;

  @Column({ type: 'uuid', nullable: true })
  financeActorEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'financeActorEmployeeId' })
  financeActor?: Employee;

  @Column({ type: 'timestamptz', nullable: true })
  financeActionAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  financeNotes?: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedByEmployeeId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  sendBackReason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  sendBackByEmployeeId?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sendBackAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  paidByEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paidByEmployeeId' })
  paidBy?: Employee;

  @Column({ length: 128, nullable: true })
  paymentReference?: string | null;

  @Column({ length: 32, nullable: true })
  paymentMode?: ExpensePaymentMode | null;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;
}
