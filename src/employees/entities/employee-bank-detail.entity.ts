import { Entity, Column, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity({ name: 'employee_bank_details' })
export class EmployeeBankDetail extends BaseEntity {
  @OneToOne(() => Employee, (e) => e.bankDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ nullable: true })
  accountHolderName?: string;

  @Column({ nullable: true })
  bankName?: string;

  /** AES-GCM ciphertext */
  @Column({ type: 'text', nullable: true })
  accountNumberEnc?: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  accountLastFour?: string | null;

  @Column({ nullable: true })
  ifscCode?: string;

  @Column({ nullable: true })
  branchName?: string;

  @Column({ default: 'PENDING' })
  verificationStatus: string;
}
