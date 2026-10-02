import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

export enum DocumentCentreBatchType {
  PAYSLIP_EXCEL = 'PAYSLIP_EXCEL',
  FORM16_ZIP = 'FORM16_ZIP',
  FORM16_SINGLE = 'FORM16_SINGLE',
}

export enum DocumentCentreBatchStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  COMMITTED = 'COMMITTED',
  FAILED = 'FAILED',
}

@Entity({ name: 'document_centre_upload_batches' })
@Index(['organizationId'])
export class DocumentCentreUploadBatch extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ length: 32 })
  type: DocumentCentreBatchType;

  @Column({ length: 32, default: DocumentCentreBatchStatus.PENDING })
  status: DocumentCentreBatchStatus;

  @Column({ type: 'int', nullable: true })
  periodMonth?: number | null;

  @Column({ type: 'int', nullable: true })
  periodYear?: number | null;

  @Column({ length: 16, nullable: true })
  financialYear?: string | null;

  @Column({ length: 512, nullable: true })
  originalFileName?: string | null;

  @Column({ length: 1024, nullable: true })
  storageKey?: string | null;

  @Column({ length: 32, nullable: true, default: 's3' })
  storageDriver?: string | null;

  @Column({ type: 'int', default: 0 })
  rowCount: number;

  @Column({ type: 'int', default: 0 })
  successCount: number;

  @Column({ type: 'int', default: 0 })
  errorCount: number;

  @Column({ type: 'jsonb', nullable: true })
  errors?: unknown[] | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedByEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploadedByEmployeeId' })
  uploadedBy?: Employee | null;
}
