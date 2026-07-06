import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { PerformanceAnswer } from './performance-answer.entity';
import type { PerformanceAssessmentSchema } from '../performance/performance-schema.types';

export enum PerformanceAssessmentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  MANAGER_REVIEWED = 'MANAGER_REVIEWED',
  COMPLETED = 'COMPLETED',
}

/**
 * A single assessment instance assigned to an employee for a review cycle.
 * Question definitions are snapshotted into `schema` at assignment time so
 * in-progress and historical assessments stay immutable when the org master changes.
 */
@Entity({ name: 'performance_assessments' })
@Index(['organizationId', 'employeeId', 'status'])
@Index(
  ['organizationId', 'employeeId', 'templateKey', 'cycleLabel'],
  { unique: true },
)
export class PerformanceAssessment extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ length: 64 })
  templateKey: string;

  @Column({ length: 191 })
  cycleLabel: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ length: 32, default: PerformanceAssessmentStatus.DRAFT })
  status: PerformanceAssessmentStatus;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  score: string;

  /** Frozen copy of org master (sections + questions + rating scale) at assign time. */
  @Column({ type: 'jsonb', nullable: true })
  schema?: PerformanceAssessmentSchema | null;

  @Column({ type: 'uuid', nullable: true })
  alignManagerEmployeeId?: string | null;

  @ManyToOne(() => Employee, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'alignManagerEmployeeId' })
  alignManager?: Employee;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  managerReviewedAt?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  hrReviewedAt?: Date | null;

  @OneToMany(() => PerformanceAnswer, (answer) => answer.assessment, {
    cascade: true,
  })
  answers?: PerformanceAnswer[];
}
