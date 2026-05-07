import { Entity, Column, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity('employee_employment_details')
export class EmployeeEmploymentDetail extends BaseEntity {
  @OneToOne(() => Employee, (e) => e.employmentDetail, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ nullable: true })
  employmentType?: string;

  @Column({ nullable: true })
  employmentStatus?: string;

  @Column({ type: 'uuid', nullable: true })
  reportingManagerId?: string;

  @Column({ type: 'uuid', nullable: true })
  hrManagerId?: string;

  @Column({ nullable: true })
  workLocation?: string;

  @Column({ nullable: true })
  workMode?: string;

  @Column({ nullable: true })
  shift?: string;

  @Column({ type: 'int', nullable: true })
  probationPeriodDays?: number;

  @Column({ type: 'int', nullable: true })
  noticePeriodDays?: number;

  @Column({ nullable: true })
  businessUnit?: string;

  @Column({ nullable: true })
  team?: string;

  @Column({ nullable: true })
  gradeBand?: string;

  @Column({ nullable: true })
  costCenter?: string;

  @Column({ nullable: true })
  previousCompanyName?: string;

  @Column({ nullable: true })
  previousDesignation?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  totalExperienceYears?: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true })
  lastDrawnCtc?: string;

  @Column({ type: 'text', nullable: true })
  experienceSummary?: string;
}
