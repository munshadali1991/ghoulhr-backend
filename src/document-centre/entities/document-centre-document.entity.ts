import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { DocumentCentreUploadBatch } from './document-centre-upload-batch.entity';

export enum DocumentCentreCategory {
  PAYSLIP = 'PAYSLIP',
  FORM16 = 'FORM16',
  POLICY = 'POLICY',
  FORM = 'FORM',
}

export enum DocumentCentreSubcategory {
  GENERAL = 'GENERAL',
  HR = 'HR',
}

export interface PayslipSalaryBreakdown {
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  netSalary: number;
}

@Entity({ name: 'document_centre_documents' })
@Index(['organizationId', 'category'])
@Index(['organizationId', 'employeeId'])
export class DocumentCentreDocument extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ length: 32 })
  category: DocumentCentreCategory;

  @Column({ length: 32, nullable: true })
  subcategory?: DocumentCentreSubcategory | null;

  @Column({ type: 'uuid', nullable: true })
  employeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee | null;

  @Column({ length: 512 })
  title: string;

  @Column({ length: 512 })
  originalFileName: string;

  @Column({ length: 128 })
  mimeType: string;

  @Column({ type: 'int', default: 0 })
  sizeBytes: number;

  @Column({ type: 'int', nullable: true })
  periodMonth?: number | null;

  @Column({ type: 'int', nullable: true })
  periodYear?: number | null;

  @Column({ length: 16, nullable: true })
  financialYear?: string | null;

  @Column({ length: 1024 })
  storageKey: string;

  @Column({ length: 32, default: 's3' })
  storageDriver: string;

  @Column({ type: 'jsonb', nullable: true })
  salaryBreakdown?: PayslipSalaryBreakdown | null;

  @Column({ type: 'uuid', nullable: true })
  uploadBatchId?: string | null;

  @ManyToOne(() => DocumentCentreUploadBatch, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'uploadBatchId' })
  uploadBatch?: DocumentCentreUploadBatch | null;

  @Column({ type: 'uuid', nullable: true })
  uploadedByEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploadedByEmployeeId' })
  uploadedBy?: Employee | null;
}
