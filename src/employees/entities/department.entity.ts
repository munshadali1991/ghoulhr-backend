import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

// Uniqueness is per-organization, enforced by partial unique indexes created in
// migration 1802000000000 (UQ_departments_org_name / UQ_departments_org_code).
@Entity({ name: 'departments' })
export class Department extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string;

  @Column({ length: 120 })
  @Index()
  name: string;

  @Column({ length: 24, nullable: true })
  @Index()
  code?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
