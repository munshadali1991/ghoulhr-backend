import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { LeaveRequest } from './leave-request.entity';

export enum EmployeeNotificationType {
  LEAVE_APPLIED = 'LEAVE_APPLIED',
  LEAVE_PENDING_APPROVAL = 'LEAVE_PENDING_APPROVAL',
  LEAVE_APPROVED = 'LEAVE_APPROVED',
  LEAVE_REJECTED = 'LEAVE_REJECTED',
}

@Entity({ name: 'employee_notifications' })
@Index(['recipientEmployeeId', 'readAt'])
@Index(['organizationId', 'recipientEmployeeId'])
export class EmployeeNotification extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  recipientEmployeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientEmployeeId' })
  recipient?: Employee;

  @Column({ type: 'uuid', nullable: true })
  leaveRequestId?: string | null;

  @ManyToOne(() => LeaveRequest, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'leaveRequestId' })
  leaveRequest?: LeaveRequest;

  @Column({ length: 64 })
  type: EmployeeNotificationType;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date | null;
}
