import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { PerformanceQuestion } from './performance-question.entity';

@Entity({ name: 'performance_sections' })
@Index(['organizationId', 'sortOrder'])
export class PerformanceSection extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ length: 64 })
  key: string;

  @Column({ length: 191 })
  title: string;

  @Column({ type: 'text', nullable: true })
  banner?: string | null;

  @Column({ length: 64 })
  role: string;

  @Column({ type: 'boolean', default: false })
  scored: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => PerformanceQuestion, (question) => question.section)
  questions?: PerformanceQuestion[];
}
