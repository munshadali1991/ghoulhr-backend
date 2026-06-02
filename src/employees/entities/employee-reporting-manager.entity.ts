import { Entity, Column, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

export const REPORTING_MANAGER_TYPE_PRIMARY = 'PRIMARY';

@Entity({ name: 'employee_reporting_managers' })
export class EmployeeReportingManager extends BaseEntity {
  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'uuid' })
  managerEmployeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'managerEmployeeId' })
  manager: Employee;

  @Column({ default: REPORTING_MANAGER_TYPE_PRIMARY })
  managerType: string;

  @Column({ type: 'date', nullable: true })
  effectiveFrom?: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo?: string;
}
