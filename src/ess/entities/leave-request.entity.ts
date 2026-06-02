import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { EmployeeDocument } from '../../employees/entities/employee-document.entity';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';

export enum LeaveRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity({ name: 'leave_requests' })
@Index(['organizationId', 'employeeId', 'status'])
@Index(['employeeId', 'startDate', 'endDate'])
export class LeaveRequest extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid' })
  leaveConfigurationId: string;

  @ManyToOne(() => LeaveConfiguration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'leaveConfigurationId' })
  leaveConfiguration?: LeaveConfiguration;

  @Column({ length: 32, default: LeaveRequestStatus.PENDING })
  status: LeaveRequestStatus;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ length: 64 })
  startSession: string;

  @Column({ length: 64 })
  endSession: string;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  daysCount: string;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({ type: 'text', nullable: true })
  contactDetails?: string | null;

  @Column({ type: 'uuid', nullable: true })
  approverEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approverEmployeeId' })
  approver?: Employee;

  @Column({ type: 'uuid', nullable: true })
  supportingDocumentId?: string | null;

  @ManyToOne(() => EmployeeDocument, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supportingDocumentId' })
  supportingDocument?: EmployeeDocument;

  @Column({ type: 'date' })
  appliedOn: string;

  @Column({ type: 'boolean', default: false })
  notifyAllEmployees: boolean;
}
