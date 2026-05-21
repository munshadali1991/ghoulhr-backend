import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'organization_settings' })
@Index(['key'], { unique: true })
export class OrganizationSetting extends BaseEntity {
  @Column()
  key: string;

  @Column({ type: 'jsonb' })
  value: any;
}
