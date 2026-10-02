import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { ExpenseCategory } from './expense-category.entity';
import { ExpenseClaim } from './expense-claim.entity';
import { ExpenseReceipt } from './expense-receipt.entity';

@Entity({ name: 'expense_claim_lines' })
@Index(['claimId'])
@Index(['organizationId', 'expenseDate'])
export class ExpenseClaimLine extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  claimId: string;

  @ManyToOne(() => ExpenseClaim, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'claimId' })
  claim?: ExpenseClaim;

  @Column({ type: 'int' })
  lineNo: number;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => ExpenseCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category?: ExpenseCategory;

  @Column({ type: 'date' })
  expenseDate: string;

  @Column({ length: 255 })
  merchant: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount: string;

  /** Points at expense_receipts.id (API field name kept for compatibility). */
  @Column({ type: 'uuid', nullable: true })
  receiptDocumentId?: string | null;

  @ManyToOne(() => ExpenseReceipt, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receiptDocumentId' })
  receiptDocument?: ExpenseReceipt;
}
