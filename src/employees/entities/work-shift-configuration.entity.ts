import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { LocationConfiguration } from './location-configuration.entity';

@Entity({ name: 'work_shift_configurations' })
@Index(['organizationId', 'sortOrder'])
@Index(['locationId'])
export class WorkShiftConfiguration extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  @Index()
  organizationId?: string | null;

  @Column({ type: 'uuid' })
  locationId: string;

  @ManyToOne(() => LocationConfiguration, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'locationId' })
  location?: LocationConfiguration;

  @Column({ length: 191 })
  name: string;

  @Column({ length: 5 })
  startTime: string;

  @Column({ length: 5 })
  endTime: string;

  @Column({ type: 'int', default: 0 })
  breakMinutes: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;
}
