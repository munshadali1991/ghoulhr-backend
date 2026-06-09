import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { WorkShiftConfiguration } from '../../employees/entities/work-shift-configuration.entity';
import { AttendanceSession } from './attendance-session.entity';

export enum AttendanceDayStatus {
  P = 'P',
  A = 'A',
  R = 'R',
}

@Entity({ name: 'attendance_daily_summaries' })
@Index(['organizationId', 'employeeId', 'workDate'], { unique: true })
export class AttendanceDailySummary extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'date' })
  workDate: string;

  @Column({ length: 8, default: AttendanceDayStatus.A })
  status: AttendanceDayStatus;

  @Column({ type: 'uuid', nullable: true })
  shiftConfigurationId?: string | null;

  @ManyToOne(() => WorkShiftConfiguration, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shiftConfigurationId' })
  shiftConfiguration?: WorkShiftConfiguration;

  @Column({ type: 'timestamptz', nullable: true })
  firstIn?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOut?: Date | null;

  @Column({ type: 'int', default: 0 })
  lateInMinutes: number;

  @Column({ type: 'int', default: 0 })
  earlyOutMinutes: number;

  @Column({ type: 'int', default: 0 })
  totalWorkMinutes: number;

  @Column({ type: 'int', default: 0 })
  breakMinutes: number;

  @Column({ type: 'int', default: 0 })
  actualWorkMinutes: number;

  @Column({ type: 'int', default: 0 })
  workInShiftMinutes: number;

  @Column({ type: 'int', default: 0 })
  shortfallMinutes: number;

  @Column({ type: 'int', default: 0 })
  excessMinutes: number;

  @Column({ type: 'text', nullable: true })
  remarks?: string | null;

  @Column({ type: 'boolean', default: false })
  exceptionFlag: boolean;

  @OneToMany(() => AttendanceSession, (s) => s.dailySummary)
  sessions?: AttendanceSession[];
}
