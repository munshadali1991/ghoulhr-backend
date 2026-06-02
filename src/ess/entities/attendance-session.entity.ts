import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { AttendanceDailySummary } from './attendance-daily-summary.entity';

@Entity({ name: 'attendance_sessions' })
@Index(['dailySummaryId'])
export class AttendanceSession extends BaseEntity {
  @Column({ type: 'uuid' })
  dailySummaryId: string;

  @ManyToOne(() => AttendanceDailySummary, (d) => d.sessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dailySummaryId' })
  dailySummary?: AttendanceDailySummary;

  @Column({ length: 64 })
  sessionLabel: string;

  @Column({ type: 'timestamptz', nullable: true })
  sessionStart?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sessionEnd?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstIn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOut?: Date | null;
}
