import { Entity, Column, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity('employee_emergency_contacts')
export class EmployeeEmergencyContact extends BaseEntity {
  @OneToOne(() => Employee, (e) => e.emergencyContactDetail, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column({ length: 200 })
  contactName: string;

  @Column({ length: 32 })
  contactPhone: string;

  /** e.g. Spouse, Parent */
  @Column({ length: 120 })
  relationship: string;
}
