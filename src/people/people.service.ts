import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { Department } from '../employees/entities/department.entity';
import { Designation } from '../employees/entities/designation.entity';
import {
  EmployeeReportingManager,
  REPORTING_MANAGER_TYPE_PRIMARY,
} from '../employees/entities/employee-reporting-manager.entity';
import { StorageService } from '../storage/storage.service';
import {
  ListPeopleQueryDto,
  PeopleView,
} from './dto/list-people-query.dto';
import type {
  PaginatedPeopleDto,
  PeopleDirectoryItemDto,
  PeopleProfileDto,
} from './dto/people-directory.dto';

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name);

  constructor(private readonly storageService: StorageService) {}

  async listPeople(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    visibleEmployeeIds: string[] | null,
    query: ListPeopleQueryDto,
  ): Promise<PaginatedPeopleDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const empty: PaginatedPeopleDto = {
      items: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };

    let scopedIds: string[] | null;

    if (query.view === PeopleView.TEAM) {
      scopedIds = await this.getDirectReportIds(dataSource, actorEmployeeId);
      if (scopedIds.length === 0) {
        return empty;
      }
    } else {
      scopedIds = visibleEmployeeIds;
      if (Array.isArray(scopedIds) && scopedIds.length === 0) {
        return empty;
      }
    }

    const search = query.search?.trim();

    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.deletedAt IS NULL')
      .leftJoin(Designation, 'z', 'z.id = e.designationId AND z.deletedAt IS NULL')
      .where('e.organizationId = :organizationId', { organizationId })
      .andWhere('e.deletedAt IS NULL');

    if (!query.includeAllStatuses) {
      const status = query.status ?? EmployeeStatus.ACTIVE;
      qb.andWhere('e.status = :status', { status });
    }

    if (scopedIds) {
      qb.andWhere('e.id IN (:...scopedIds)', { scopedIds });
    }

    if (query.departmentId) {
      qb.andWhere('e.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    if (query.designationId) {
      qb.andWhere('e.designationId = :designationId', {
        designationId: query.designationId,
      });
    }

    if (search) {
      qb.andWhere(
        `(e.name ILIKE :search
          OR e.employeeCode ILIKE :search
          OR e.email ILIKE :search
          OR d.name ILIKE :search
          OR z.name ILIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const total = await qb.clone().getCount();
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const rows = await qb
      .select([
        'e.id AS id',
        'e.employeeCode AS "employeeCode"',
        'e.name AS name',
        'e.email AS email',
        'e.phoneNumber AS "phoneNumber"',
        'e.status AS status',
        'e.dateOfJoining AS "dateOfJoining"',
        'e.profilePhotoStorageKey AS "profilePhotoStorageKey"',
        'e.profilePhotoUrl AS "profilePhotoUrl"',
        'e.organizationId AS "organizationId"',
        'd.name AS "departmentName"',
        'z.name AS "designationName"',
      ])
      .orderBy('e.name', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        employeeCode: string;
        name: string;
        email: string;
        phoneNumber: string | null;
        status: string;
        dateOfJoining: Date | string | null;
        profilePhotoStorageKey: string | null;
        profilePhotoUrl: string | null;
        organizationId: string;
        departmentName: string | null;
        designationName: string | null;
      }>();

    const items: PeopleDirectoryItemDto[] = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        employeeCode: row.employeeCode,
        name: row.name,
        email: row.email,
        phoneNumber: row.phoneNumber ?? null,
        status: row.status,
        departmentName: row.departmentName ?? null,
        designationName: row.designationName ?? null,
        dateOfJoining: this.toDateString(row.dateOfJoining),
        profilePhotoPreviewUrl: await this.resolvePhoto({
          organizationId: row.organizationId,
          profilePhotoStorageKey: row.profilePhotoStorageKey,
          profilePhotoUrl: row.profilePhotoUrl,
        }),
      })),
    );

    return { items, total, page, limit, totalPages };
  }

  async getFilterOptions(
    dataSource: DataSource,
    organizationId: string,
  ): Promise<{
    departments: Array<{ id: string; name: string }>;
    designations: Array<{ id: string; name: string }>;
  }> {
    const [departments, designations] = await Promise.all([
      dataSource.getRepository(Department).find({
        where: { organizationId, isActive: true, deletedAt: IsNull() },
        select: ['id', 'name'],
        order: { name: 'ASC' },
      }),
      dataSource.getRepository(Designation).find({
        where: { organizationId, isActive: true, deletedAt: IsNull() },
        select: ['id', 'name'],
        order: { name: 'ASC' },
      }),
    ]);

    return {
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
      designations: designations.map((d) => ({ id: d.id, name: d.name })),
    };
  }

  async getPersonProfile(
    dataSource: DataSource,
    organizationId: string,
    actorEmployeeId: string,
    visibleEmployeeIds: string[] | null,
    employeeId: string,
  ): Promise<PeopleProfileDto> {
    const allowed =
      visibleEmployeeIds === null ||
      visibleEmployeeIds.includes(employeeId) ||
      (await this.isDirectReport(dataSource, actorEmployeeId, employeeId));

    if (!allowed) {
      throw new NotFoundException('Employee not found.');
    }

    const employee = await dataSource.getRepository(Employee).findOne({
      where: { id: employeeId, organizationId, deletedAt: IsNull() },
      relations: ['departmentRef', 'designationRef'],
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const managerLink = await dataSource
      .getRepository(EmployeeReportingManager)
      .createQueryBuilder('rm')
      .leftJoinAndSelect('rm.manager', 'manager')
      .leftJoinAndSelect('manager.designationRef', 'mgrDesig')
      .where('rm.employeeId = :employeeId', { employeeId })
      .andWhere('rm.managerType = :managerType', {
        managerType: REPORTING_MANAGER_TYPE_PRIMARY,
      })
      .andWhere('rm.deletedAt IS NULL')
      .andWhere('(rm.effectiveTo IS NULL OR rm.effectiveTo >= CURRENT_DATE)')
      .andWhere('rm.effectiveFrom <= CURRENT_DATE')
      .orderBy('rm.effectiveFrom', 'DESC')
      .getOne();

    const manager = managerLink?.manager
      ? {
          id: managerLink.manager.id,
          name: managerLink.manager.name,
          designationName: managerLink.manager.designationRef?.name ?? null,
        }
      : null;

    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      phoneNumber: employee.phoneNumber ?? null,
      address: employee.address?.trim() ? employee.address.trim() : null,
      status: employee.status,
      departmentId: employee.departmentId ?? null,
      departmentName: employee.departmentRef?.name ?? null,
      designationId: employee.designationId ?? null,
      designationName: employee.designationRef?.name ?? null,
      dateOfJoining: this.toDateString(employee.dateOfJoining ?? null),
      profilePhotoPreviewUrl: await this.resolvePhoto(employee),
      manager,
    };
  }

  /**
   * Active direct reports only (excludes self).
   */
  async getDirectReportIds(
    dataSource: DataSource,
    managerEmployeeId: string,
  ): Promise<string[]> {
    const reportRows = await dataSource
      .getRepository(EmployeeReportingManager)
      .createQueryBuilder('rm')
      .where('rm.managerEmployeeId = :managerId', {
        managerId: managerEmployeeId,
      })
      .andWhere('rm.deletedAt IS NULL')
      .andWhere('(rm.effectiveTo IS NULL OR rm.effectiveTo >= CURRENT_DATE)')
      .andWhere('rm.effectiveFrom <= CURRENT_DATE')
      .getMany();

    const ids = new Set<string>();
    for (const row of reportRows) {
      if (row.employeeId !== managerEmployeeId) {
        ids.add(row.employeeId);
      }
    }
    return [...ids];
  }

  private async isDirectReport(
    dataSource: DataSource,
    managerEmployeeId: string,
    employeeId: string,
  ): Promise<boolean> {
    if (employeeId === managerEmployeeId) return false;
    const ids = await this.getDirectReportIds(dataSource, managerEmployeeId);
    return ids.includes(employeeId);
  }

  private toDateString(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (!raw) return null;
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
  }

  private async resolvePhoto(employee: {
    organizationId?: string | null;
    profilePhotoStorageKey?: string | null;
    profilePhotoUrl?: string | null;
  }): Promise<string | null> {
    const key = employee.profilePhotoStorageKey?.trim();
    if (key && employee.organizationId) {
      try {
        return await this.storageService.getAssetPreviewUrl(
          employee.organizationId,
          key,
          'image/jpeg',
        );
      } catch (err) {
        this.logger.warn(
          `Profile photo preview failed: ${(err as Error).message}`,
        );
      }
    }
    const legacy = employee.profilePhotoUrl?.trim();
    if (
      legacy &&
      (legacy.startsWith('http://') ||
        legacy.startsWith('https://') ||
        legacy.startsWith('data:'))
    ) {
      return legacy;
    }
    return null;
  }
}
