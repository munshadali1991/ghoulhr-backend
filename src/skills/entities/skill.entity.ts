import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { SkillCategory } from './skill-category.entity';
import { SkillSubcategory } from './skill-subcategory.entity';

@Entity({ name: 'skills' })
@Index(['organizationId', 'sortOrder'])
@Index(['organizationId', 'categoryId'])
@Index(['organizationId', 'subcategoryId'])
export class Skill extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  organizationId: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => SkillCategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'categoryId' })
  category?: SkillCategory;

  @Column({ type: 'uuid' })
  subcategoryId: string;

  @ManyToOne(() => SkillSubcategory, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subcategoryId' })
  subcategory?: SkillSubcategory;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
