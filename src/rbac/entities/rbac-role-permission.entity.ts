import { Entity, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { AccessScope } from '../constants/access-scope.enum';
import { RbacRole } from './rbac-role.entity';
import { RbacPermission } from './rbac-permission.entity';

@Entity({ name: 'rbac_role_permissions' })
@Unique(['roleId', 'permissionId'])
export class RbacRolePermission extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  roleId: string;

  @ManyToOne(() => RbacRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roleId' })
  role?: RbacRole;

  @Column({ type: 'uuid' })
  @Index()
  permissionId: string;

  @ManyToOne(() => RbacPermission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permissionId' })
  permission?: RbacPermission;

  @Column({ type: 'varchar', length: 32, default: AccessScope.SELF })
  accessScope: AccessScope;
}
