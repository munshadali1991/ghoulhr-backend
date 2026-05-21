import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'locations_configurations' })
@Index(['organizationId', 'sortOrder'])
export class LocationConfiguration extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string | null;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 32, nullable: true })
  code?: string | null;

  @Column({ type: 'text', nullable: true })
  addressLine1?: string | null;

  @Column({ length: 120, nullable: true })
  city?: string | null;

  @Column({ length: 120, nullable: true })
  region?: string | null;

  @Column({ length: 32, nullable: true })
  postalCode?: string | null;

  @Column({ length: 120, nullable: true })
  country?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude?: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude?: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
