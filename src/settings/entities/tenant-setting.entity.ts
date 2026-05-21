import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { SettingCatalog } from './setting-catalog.entity';

@Entity({ name: 'tenant_settings' })
@Index(['settingCatalogId'], { unique: true })
export class TenantSetting extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string;

  @Column({ type: 'uuid' })
  settingCatalogId: string;

  @ManyToOne(() => SettingCatalog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'settingCatalogId' })
  catalog: SettingCatalog;

  @Column({ type: 'jsonb' })
  value: unknown;
}
