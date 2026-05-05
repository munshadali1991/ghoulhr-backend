import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../employee.entity';

@Entity('employee_documents')
export class EmployeeDocument extends BaseEntity {
  @ManyToOne(() => Employee, (e) => e.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  documentType: string;

  @Column()
  fileName: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ default: 'inline_base64' })
  storageDriver: string;

  /** Encrypted base64 file body for inline storage (replace with S3 key later). */
  @Column({ type: 'text', nullable: true })
  payloadEnc?: string | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedBy?: string;

  @Column({ default: 'PENDING' })
  verificationStatus: string;
}
