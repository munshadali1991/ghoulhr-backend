import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { WorkShiftConfiguration } from './work-shift-configuration.entity';

@Entity({ name: 'work_shift_sessions' })
@Index(['shiftConfigurationId'])
export class WorkShiftSession extends BaseEntity {
  @Column({ type: 'uuid' })
  shiftConfigurationId: string;

  @ManyToOne(() => WorkShiftConfiguration, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shiftConfigurationId' })
  shiftConfiguration?: WorkShiftConfiguration;

  @Column({ length: 64 })
  sessionLabel: string;

  @Column({ length: 5 })
  startTime: string;

  @Column({ length: 5 })
  endTime: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
