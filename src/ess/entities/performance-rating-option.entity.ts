import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'performance_rating_options' })
@Index(['organizationId', 'sortOrder'])
export class PerformanceRatingOption extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ length: 64 })
  label: string;

  @Column({ type: 'int' })
  weight: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
