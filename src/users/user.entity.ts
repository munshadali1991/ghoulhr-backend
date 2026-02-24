import { Entity, Column, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../database/base.entity';
import { Role } from '../roles/roles.enum';
import { UserStatus } from './user-status.enum';
import { Organization } from '../organizations/organization.entity';

@Entity('users')
@Unique(['email', 'organizationId'])
export class User extends BaseEntity {
  @Column()
  organizationId: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization: Organization;

  @Column()
  email: string;

  @Column()
  password: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.EMPLOYEE,
  })
  role: Role;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;
}
