import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'expense_categories' })
@Index(['organizationId', 'isActive'])
export class ExpenseCategory extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ length: 64 })
  code: string;

  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Receipt required when line amount >= this value. Default 0 = always require. */
  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  receiptRequiredAboveAmount: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  maxAmountPerLine?: string | null;

  @Column({ type: 'int', nullable: true })
  claimWindowDays?: number | null;
}
