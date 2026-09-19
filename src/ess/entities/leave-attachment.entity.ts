import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

/**
 * Leave-domain supporting attachment metadata. Isolated from HR employee_documents.
 */
@Entity({ name: 'leave_attachments' })
@Index(['organizationId', 'employeeId'])
export class LeaveAttachment extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'uuid', nullable: true })
  leaveRequestId?: string | null;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ default: 's3' })
  storageDriver: string;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  storageKey?: string | null;

  /** Legacy inline leave attachments. */
  @Column({ type: 'text', nullable: true })
  payloadEnc?: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy?: string | null;

  @Column({ default: 'PENDING' })
  verificationStatus: string;
}
