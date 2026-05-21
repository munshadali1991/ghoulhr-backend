import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'settings_catalog' })
export class SettingCatalog extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string;

  @Column({ length: 191 })
  @Index({ unique: true })
  key: string;

  @Column({ length: 40 })
  valueType: string;

  @Column({ length: 40, default: 'tenant' })
  scope: string;

  @Column({ type: 'boolean', default: false })
  isSecret: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;
}
