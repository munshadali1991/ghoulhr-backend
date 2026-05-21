import { Entity, Column, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity({ name: 'employee_salary_details' })
export class EmployeeSalaryDetail extends BaseEntity {
  @OneToOne(() => Employee, (e) => e.salaryDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  ctc?: string;

  @Column({ nullable: true })
  salaryStructure?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  basicSalary?: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  hra?: string;

  @Column({ type: 'jsonb', nullable: true })
  allowancesJson?: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  pfApplicable: boolean;

  @Column({ type: 'boolean', default: false })
  esicApplicable: boolean;

  @Column({ nullable: true })
  taxRegime?: string;
}
