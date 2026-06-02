import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';

@Entity({ name: 'employee_leave_balances' })
@Index(['organizationId', 'employeeId', 'year'])
export class EmployeeLeaveBalance extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ type: 'uuid' })
  @Index()
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid' })
  leaveConfigurationId: string;

  @ManyToOne(() => LeaveConfiguration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leaveConfigurationId' })
  leaveConfiguration?: LeaveConfiguration;

  @Column({ type: 'smallint' })
  year: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  grantedDays: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  usedDays: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  pendingDays: string;
}
