import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';

@Entity({ name: 'rbac_permissions' })
export class RbacPermission extends BaseEntity {
  @Column({ unique: true })
  @Index()
  code: string;

  @Column()
  @Index()
  moduleCode: string;

  @Column()
  action: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
