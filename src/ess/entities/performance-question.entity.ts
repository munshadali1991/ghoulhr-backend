import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { PerformanceSection } from './performance-section.entity';

@Entity({ name: 'performance_questions' })
@Index(['organizationId', 'sectionId', 'sortOrder'])
export class PerformanceQuestion extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => PerformanceSection, (section) => section.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sectionId' })
  section?: PerformanceSection;

  @Column({ length: 64 })
  key: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ length: 32 })
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  options?: string[] | null;

  @Column({ type: 'boolean', default: false })
  allowComment: boolean;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'text', nullable: true })
  helperText?: string | null;

  @Column({ length: 191, nullable: true })
  placeholder?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
