import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RefreshSession } from './refresh-session.entity';

@Entity('auth_handoff_tokens')
export class AuthHandoffToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  tokenHash: string;

  @Column({ type: 'uuid' })
  refreshSessionId: string;

  @ManyToOne(() => RefreshSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refreshSessionId' })
  refreshSession?: RefreshSession;

  @Column({ type: 'varchar', length: 128 })
  targetSubdomain: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
