import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'platform_modules' })
export class PlatformModule extends BaseEntity {
  @Column({ unique: true })
  @Index()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
