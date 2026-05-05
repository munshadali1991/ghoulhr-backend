import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/user.entity';
import { Organization } from '../../organizations/organization.entity';

export type RefreshSessionKind = 'master' | 'employee';

@Entity('refresh_sessions')
export class RefreshSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', length: 16 })
  sessionKind: RefreshSessionKind;

  @Column({ type: 'uuid', nullable: true })
  masterUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'masterUserId' })
  masterUser?: User | null;

  @Column({ type: 'uuid', nullable: true })
  employeeId: string | null;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization | null;

  @Column({ type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedBySessionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
