import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { ExpenseClaim } from './expense-claim.entity';

/**
 * Expense-domain receipt metadata. Isolated from HR employee_documents.
 * claimLineId is unique among non-deleted rows (1:1 with line when set).
 */
@Entity({ name: 'expense_receipts' })
@Index(['organizationId', 'employeeId'])
@Index(['claimId'])
export class ExpenseReceipt extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid', nullable: true })
  claimId?: string | null;

  @ManyToOne(() => ExpenseClaim, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'claimId' })
  claim?: ExpenseClaim;

  /** Set after the claim line is persisted. */
  @Column({ type: 'uuid', nullable: true })
  claimLineId?: string | null;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ default: 's3' })
  storageDriver: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  storageKey?: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy?: string | null;

  @Column({ default: 'PENDING' })
  verificationStatus: string;
}
