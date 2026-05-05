import { Entity, Column, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity('employee_access_control')
export class EmployeeAccessControl extends BaseEntity {
  @OneToOne(() => Employee, (e) => e.accessControl, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ type: 'boolean', default: true })
  hrmsAccessEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  welcomeEmailEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  mfaEnabled: boolean;

  /** UI role label (HR, Payroll, …) — system role remains on employees.role */
  @Column({ nullable: true })
  portalRoleLabel?: string;
}
