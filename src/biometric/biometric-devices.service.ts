import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LocationConfiguration } from '../employees/entities/location-configuration.entity';
import {
  BiometricDevice,
  BiometricDeviceBrand,
  BiometricDeviceStatus,
} from './entities/biometric-device.entity';
import { BiometricAuditLog } from './entities/biometric-audit-log.entity';
import { hashCommKey } from './biometric-ingest.service';
import {
  CreateBiometricDeviceDto,
  UpdateBiometricDeviceDto,
} from './dto/biometric-admin.dto';

@Injectable()
export class BiometricDevicesService {
  async list(dataSource: DataSource, organizationId: string) {
    const rows = await dataSource.getRepository(BiometricDevice).find({
      where: { organizationId },
      relations: ['location'],
      order: { name: 'ASC' },
    });
    return rows.map((d) => this.toApi(d));
  }

  async create(
    dataSource: DataSource,
    organizationId: string,
    dto: CreateBiometricDeviceDto,
    actorEmployeeId?: string,
  ) {
    const serial = dto.serialNumber.trim();
    const existing = await dataSource.getRepository(BiometricDevice).findOne({
      where: { organizationId, serialNumber: serial },
      withDeleted: true,
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(
        `Device serial "${serial}" is already registered`,
      );
    }

    if (dto.locationId) {
      await this.assertLocation(dataSource, organizationId, dto.locationId);
    }

    const repo = dataSource.getRepository(BiometricDevice);
    if (existing?.deletedAt) {
      await repo.recover(existing);
      existing.name = dto.name.trim();
      existing.brand = dto.brand ?? BiometricDeviceBrand.ZKTECO;
      existing.locationId = dto.locationId ?? null;
      existing.status = dto.status ?? BiometricDeviceStatus.ACTIVE;
      existing.firmwareVersion = dto.firmwareVersion ?? null;
      existing.timezone = dto.timezone ?? null;
      existing.commKeyHash = dto.commKey ? hashCommKey(dto.commKey) : null;
      const saved = await repo.save(existing);
      await this.audit(dataSource, organizationId, actorEmployeeId, 'DEVICE_CREATE', saved.id, null, this.toApi(saved));
      return this.toApi(saved);
    }

    const saved = await repo.save(
      repo.create({
        organizationId,
        serialNumber: serial,
        name: dto.name.trim(),
        brand: dto.brand ?? BiometricDeviceBrand.ZKTECO,
        locationId: dto.locationId ?? null,
        status: dto.status ?? BiometricDeviceStatus.ACTIVE,
        firmwareVersion: dto.firmwareVersion ?? null,
        timezone: dto.timezone ?? null,
        commKeyHash: dto.commKey ? hashCommKey(dto.commKey) : null,
      }),
    );

    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'DEVICE_CREATE',
      saved.id,
      null,
      this.toApi(saved),
    );
    return this.toApi(saved);
  }

  async update(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    dto: UpdateBiometricDeviceDto,
    actorEmployeeId?: string,
  ) {
    const repo = dataSource.getRepository(BiometricDevice);
    const device = await repo.findOne({ where: { id, organizationId } });
    if (!device) throw new NotFoundException('Device not found');

    const before = this.toApi(device);

    if (dto.serialNumber != null) {
      const serial = dto.serialNumber.trim();
      const clash = await repo.findOne({
        where: { organizationId, serialNumber: serial },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
          `Device serial "${serial}" is already registered`,
        );
      }
      device.serialNumber = serial;
    }
    if (dto.name != null) device.name = dto.name.trim();
    if (dto.brand != null) device.brand = dto.brand;
    if (dto.status != null) device.status = dto.status;
    if (dto.firmwareVersion !== undefined) {
      device.firmwareVersion = dto.firmwareVersion;
    }
    if (dto.timezone !== undefined) device.timezone = dto.timezone;
    if (dto.locationId !== undefined) {
      if (dto.locationId) {
        await this.assertLocation(dataSource, organizationId, dto.locationId);
      }
      device.locationId = dto.locationId;
    }
    if (dto.commKey !== undefined) {
      device.commKeyHash = dto.commKey ? hashCommKey(dto.commKey) : null;
    }

    const saved = await repo.save(device);
    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'DEVICE_UPDATE',
      saved.id,
      before,
      this.toApi(saved),
      dto.reason,
    );
    return this.toApi(
      await repo.findOne({
        where: { id: saved.id },
        relations: ['location'],
      })!,
    );
  }

  async remove(
    dataSource: DataSource,
    organizationId: string,
    id: string,
    actorEmployeeId?: string,
    reason?: string,
  ) {
    const repo = dataSource.getRepository(BiometricDevice);
    const device = await repo.findOne({ where: { id, organizationId } });
    if (!device) throw new NotFoundException('Device not found');
    const before = this.toApi(device);
    await repo.softRemove(device);
    await this.audit(
      dataSource,
      organizationId,
      actorEmployeeId,
      'DEVICE_DELETE',
      id,
      before,
      null,
      reason,
    );
  }

  private async assertLocation(
    dataSource: DataSource,
    organizationId: string,
    locationId: string,
  ) {
    const loc = await dataSource.getRepository(LocationConfiguration).findOne({
      where: { id: locationId, organizationId },
    });
    if (!loc) {
      throw new BadRequestException('Invalid locationId for this organization');
    }
  }

  private toApi(d: BiometricDevice) {
    return {
      id: d.id,
      serialNumber: d.serialNumber,
      name: d.name,
      brand: d.brand,
      locationId: d.locationId ?? null,
      locationName: d.location?.name ?? null,
      status: d.status,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      firmwareVersion: d.firmwareVersion ?? null,
      timezone: d.timezone ?? null,
      hasCommKey: Boolean(d.commKeyHash),
      createdAt: d.createdAt?.toISOString?.() ?? d.createdAt,
      updatedAt: d.updatedAt?.toISOString?.() ?? d.updatedAt,
    };
  }

  private async audit(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string | undefined,
    action: string,
    entityId: string,
    beforeJson: Record<string, unknown> | null,
    afterJson: Record<string, unknown> | null,
    reason?: string,
  ) {
    const repo = dataSource.getRepository(BiometricAuditLog);
    await repo.save(
      repo.create({
        organizationId,
        actorEmployeeId: actorEmployeeId ?? null,
        action,
        entityType: 'biometric_device',
        entityId,
        reason: reason ?? null,
        beforeJson,
        afterJson,
      }),
    );
  }
}
