import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';

export enum AttendancePunchType {
  IN = 'IN',
  OUT = 'OUT',
}

@Entity({ name: 'attendance_punches' })
@Index(['organizationId', 'employeeId', 'punchedAt'])
@Index(['employeeId', 'punchedAt'])
export class AttendancePunch extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee?: Employee;

  @Column({ type: 'timestamptz' })
  punchedAt: Date;

  @Column({ length: 8 })
  punchType: AttendancePunchType;

  @Column({ length: 32, default: 'WEB' })
  source: string;

  @Column({ type: 'double precision', nullable: true })
  latitude?: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude?: number | null;
}
