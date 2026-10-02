import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { Employee } from '../../employees/employee.entity';
import { BiometricDevice } from './biometric-device.entity';

export enum BiometricUnmappedStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
}

@Entity({ name: 'biometric_unmapped_punches' })
@Index(['organizationId', 'biometricId', 'status'])
@Index(['organizationId', 'eventTimestamp'])
export class BiometricUnmappedPunch extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid', nullable: true })
  deviceId?: string | null;

  @ManyToOne(() => BiometricDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'deviceId' })
  device?: BiometricDevice | null;

  @Column({ type: 'varchar', length: 64 })
  serialNumber: string;

  @Column({ type: 'int' })
  biometricId: number;

  @Column({ type: 'timestamptz' })
  eventTimestamp: Date;

  @Column({ type: 'varchar', length: 32, nullable: true })
  rawPunchType?: string | null;

  @Column({ type: 'text', nullable: true })
  rawPayload?: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: BiometricUnmappedStatus.OPEN,
  })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  resolvedEmployeeId?: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolvedEmployeeId' })
  resolvedEmployee?: Employee | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedByEmployeeId?: string | null;
}
