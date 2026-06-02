import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { TimesheetEntry } from './timesheet-entry.entity';

export enum TimesheetDayStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'timesheet_days' })
@Index(['organizationId', 'employeeId', 'workDate', 'status'])
@Index(['organizationId', 'employeeId', 'workDate'], { unique: true })
export class TimesheetDay extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'date' })
  workDate: string;

  @Column({ length: 32, default: TimesheetDayStatus.DRAFT })
  status: TimesheetDayStatus;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0 })
  totalHours: string;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  approverEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approverEmployeeId' })
  approver?: Employee;

  @OneToMany(() => TimesheetEntry, (entry) => entry.timesheetDay, {
    cascade: true,
  })
  entries?: TimesheetEntry[];
}
