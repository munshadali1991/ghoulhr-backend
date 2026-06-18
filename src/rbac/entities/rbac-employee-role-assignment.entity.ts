import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { RbacRole } from './rbac-role.entity';

@Entity({ name: 'rbac_employee_role_assignments' })
@Index(['employeeId', 'roleId'])
export class RbacEmployeeRoleAssignment extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid' })
  @Index()
  roleId: string;

  @ManyToOne(() => RbacRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: RbacRole;

  @Column({ type: 'date', nullable: true })
  effectiveFrom?: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo?: string;

  @Column({ type: 'uuid', nullable: true })
  assignedBy?: string;

  @Column({ type: 'boolean', default: true })
  isPrimary: boolean;
}
