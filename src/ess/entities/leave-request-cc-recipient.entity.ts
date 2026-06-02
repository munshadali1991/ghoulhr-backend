import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { LeaveRequest } from './leave-request.entity';

@Entity({ name: 'leave_request_cc_recipients' })
@Unique(['leaveRequestId', 'employeeId'])
@Index(['leaveRequestId'])
export class LeaveRequestCcRecipient extends BaseEntity {
  @Column({ type: 'uuid' })
  leaveRequestId: string;

  @ManyToOne(() => LeaveRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leaveRequestId' })
  leaveRequest?: LeaveRequest;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;
}
