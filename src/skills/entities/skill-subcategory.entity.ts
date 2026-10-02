import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { SkillCategory } from './skill-category.entity';

@Entity({ name: 'skill_subcategories' })
@Index(['organizationId', 'sortOrder'])
@Index(['organizationId', 'categoryId'])
export class SkillSubcategory extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => SkillCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category?: SkillCategory;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
