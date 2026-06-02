import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { TimesheetDay } from './timesheet-day.entity';

export enum TimesheetWorkType {
  DEVELOPMENT = 'DEVELOPMENT',
  BUG_FIX = 'BUG_FIX',
  TESTING = 'TESTING',
  MEETING = 'MEETING',
  RESEARCH = 'RESEARCH',
  DOCUMENTATION = 'DOCUMENTATION',
  DEPLOYMENT = 'DEPLOYMENT',
  SUPPORT = 'SUPPORT',
}

export enum TimesheetTaskStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  ON_HOLD = 'ON_HOLD',
}

export enum TimesheetPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity({ name: 'timesheet_entries' })
@Index(['timesheetDayId'])
export class TimesheetEntry extends BaseEntity {
  @Column({ type: 'uuid' })
  timesheetDayId: string;

  @ManyToOne(() => TimesheetDay, (day) => day.entries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'timesheetDayId' })
  timesheetDay?: TimesheetDay;

  @Column({ length: 120 })
  projectName: string;

  @Column({ length: 200 })
  taskName: string;

  @Column({ type: 'text' })
  taskDescription: string;

  @Column({ length: 32 })
  workType: TimesheetWorkType;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  hoursSpent: string;

  @Column({ length: 32 })
  taskStatus: TimesheetTaskStatus;

  @Column({ length: 32 })
  priority: TimesheetPriority;

  @Column({ type: 'text', nullable: true })
  blockerNotes?: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
