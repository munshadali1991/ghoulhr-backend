import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { PerformanceAssessment } from './performance-assessment.entity';

export enum PerformanceAnswerRole {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  HR = 'HR',
}

/**
 * One answer row per question, keyed by the frontend schema `questionKey`.
 * The flexible value columns keep the store schema-agnostic while the frontend
 * config owns question definitions/types.
 */
@Entity({ name: 'performance_answers' })
@Index(['assessmentId', 'questionKey'], { unique: true })
export class PerformanceAnswer extends BaseEntity {
  @Column({ type: 'uuid' })
  assessmentId: string;

  @ManyToOne(() => PerformanceAssessment, (a) => a.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'assessmentId' })
  assessment?: PerformanceAssessment;

  @Column({ length: 64 })
  questionKey: string;

  @Column({ length: 64, nullable: true })
  section?: string | null;

  @Column({ length: 32, nullable: true })
  answerType?: string | null;

  @Column({ type: 'text', nullable: true })
  valueText?: string | null;

  @Column({ length: 64, nullable: true })
  valueRating?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  valueNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  comment?: string | null;

  @Column({ length: 64, default: PerformanceAnswerRole.EMPLOYEE })
  filledByRole: string;
}
