import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../database/base.entity';
import { LocationConfiguration } from '../../employees/entities/location-configuration.entity';

export enum BiometricDeviceBrand {
  ZKTECO = 'ZKTECO',
}

export enum BiometricDeviceStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISABLED = 'DISABLED',
}

@Entity({ name: 'biometric_devices' })
@Index(['organizationId', 'status'])
export class BiometricDevice extends BaseEntity {
  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', length: 64 })
  serialNumber: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 32, default: BiometricDeviceBrand.ZKTECO })
  brand: string;

  @Column({ type: 'uuid', nullable: true })
  locationId?: string | null;

  @ManyToOne(() => LocationConfiguration, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'locationId' })
  location?: LocationConfiguration | null;

  @Column({ type: 'varchar', length: 16, default: BiometricDeviceStatus.ACTIVE })
  status: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt?: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  firmwareVersion?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone?: string | null;

  /** bcrypt/sha hash of optional ADMS comm key; never store plaintext. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  commKeyHash?: string | null;
}
