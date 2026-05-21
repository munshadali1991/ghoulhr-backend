import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'departments' })
export class Department extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string;

  @Column({ length: 120 })
  @Index({ unique: true })
  name: string;

  @Column({ length: 24, nullable: true })
  @Index({ unique: true })
  code?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
