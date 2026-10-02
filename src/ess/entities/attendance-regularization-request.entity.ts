import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

export enum AttendanceRegularizationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity({ name: 'attendance_regularization_requests' })
@Index(['organizationId', 'employeeId', 'status'])
@Index(['approverEmployeeId', 'status'])
export class AttendanceRegularizationRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'date' })
  workDate: string;

  @Column({ type: 'timestamptz' })
  requestedInAt: Date;

  @Column({ type: 'timestamptz' })
  requestedOutAt: Date;

  @Column({ type: 'text' })
  reason: string;

  @Column({ length: 32, default: AttendanceRegularizationStatus.PENDING })
  status: AttendanceRegularizationStatus;

  @Column({ type: 'uuid', nullable: true })
  approverEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approverEmployeeId' })
  approver?: Employee;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @Column({ type: 'text', nullable: true })
  approvalNotes?: string | null;

  @Column({ type: 'date' })
  appliedOn: string;
}
