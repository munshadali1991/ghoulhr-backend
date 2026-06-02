import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Employee, EmployeeStatus } from './employee.entity';
import {
  EmployeeReportingManager,
  REPORTING_MANAGER_TYPE_PRIMARY,
} from './entities/employee-reporting-manager.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { AssignReportingManagerDto } from './dto/assign-reporting-manager.dto';
import { ListReportingManagersQueryDto } from './dto/list-reporting-managers-query.dto';

export type ReportingManagerListItem = {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentName?: string;
  designationName?: string;
  status: string;
  manager: {
    id: string;
    name: string;
    employeeCode: string;
  } | null;
  effectiveFrom?: string;
  assignmentId?: string;
};

@Injectable()
export class ReportingManagersService {
  async getActiveReportingManagerId(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<string | null> {
    const row = await this.getActivePrimaryRow(dataSource, employeeId);
    return row?.managerEmployeeId ?? null;
  }

  async listAssignments(
    dataSource: DataSource,
    query: ListReportingManagersQueryDto,
  ): Promise<ReportingManagerListItem[]> {
    const filter = query.filter ?? 'all';
    const search = (query.search ?? '').trim().toLowerCase();

    const qb = dataSource
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoin(Department, 'd', 'd.id = e.departmentId')
      .leftJoin(Designation, 'z', 'z.id = e.designationId')
      .leftJoin(
        EmployeeReportingManager,
        'erm',
        `erm.employeeId = e.id AND erm.managerType = :managerType AND erm.effectiveTo IS NULL AND erm.deletedAt IS NULL`,
        { managerType: REPORTING_MANAGER_TYPE_PRIMARY },
      )
      .leftJoin(Employee, 'm', 'm.id = erm.managerEmployeeId')
      .where('e.deletedAt IS NULL')
      .andWhere('e.status != :terminated', {
        terminated: EmployeeStatus.TERMINATED,
      })
      .select([
        'e.id AS "employeeId"',
        'e.name AS "employeeName"',
        'e.employeeCode AS "employeeCode"',
        'e.status AS status',
        'd.name AS "departmentName"',
        'z.name AS "designationName"',
        'erm.id AS "assignmentId"',
        'erm.effectiveFrom AS "effectiveFrom"',
        'm.id AS "managerId"',
        'm.name AS "managerName"',
        'm.employeeCode AS "managerCode"',
      ])
      .orderBy('e.name', 'ASC');

    if (filter === 'unassigned') {
      qb.andWhere('erm.id IS NULL');
    }

    if (search) {
      qb.andWhere(
        `(LOWER(e.name) LIKE :search OR LOWER(e.employeeCode) LIKE :search OR LOWER(COALESCE(m.name, '')) LIKE :search OR LOWER(COALESCE(m.employeeCode, '')) LIKE :search)`,
        { search: `%${search}%` },
      );
    }

    const rows = await qb.getRawMany<{
      employeeId: string;
      employeeName: string;
      employeeCode: string;
      departmentName?: string;
      designationName?: string;
      status: string;
      assignmentId?: string;
      effectiveFrom?: string;
      managerId?: string;
      managerName?: string;
      managerCode?: string;
    }>();

    return rows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
      departmentName: row.departmentName ?? undefined,
      designationName: row.designationName ?? undefined,
      status: row.status,
      assignmentId: row.assignmentId ?? undefined,
      effectiveFrom: row.effectiveFrom
        ? String(row.effectiveFrom).slice(0, 10)
        : undefined,
      manager: row.managerId
        ? {
            id: row.managerId,
            name: row.managerName!,
            employeeCode: row.managerCode!,
          }
        : null,
    }));
  }

  async getAssignmentForEmployee(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<ReportingManagerListItem | null> {
    const items = await this.listAssignments(dataSource, {
      filter: 'all',
    });
    return items.find((i) => i.employeeId === employeeId) ?? null;
  }

  async assignOrChange(
    dataSource: DataSource,
    employeeId: string,
    dto: AssignReportingManagerDto,
  ): Promise<ReportingManagerListItem> {
    const managerEmployeeId = dto.managerEmployeeId.trim();
    this.assertUuid(employeeId, 'Employee');
    this.assertUuid(managerEmployeeId, 'Reporting manager');

    if (employeeId === managerEmployeeId) {
      throw new BadRequestException('An employee cannot report to themselves');
    }

    const empRepo = dataSource.getRepository(Employee);
    const [employee, manager] = await Promise.all([
      empRepo.findOne({ where: { id: employeeId } }),
      empRepo.findOne({ where: { id: managerEmployeeId } }),
    ]);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!manager) {
      throw new NotFoundException('Reporting manager not found');
    }
    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new BadRequestException('Cannot assign manager to a terminated employee');
    }
    if (manager.status === EmployeeStatus.TERMINATED) {
      throw new BadRequestException('Terminated employees cannot be reporting managers');
    }

    await this.assertNoCycle(dataSource, employeeId, managerEmployeeId);

    const effectiveFrom =
      dto.effectiveFrom?.trim() ||
      new Date().toISOString().slice(0, 10);

    await dataSource.transaction(async (em) => {
      const repo = em.getRepository(EmployeeReportingManager);
      const active = await this.findActivePrimary(repo, employeeId);

      if (
        active &&
        active.managerEmployeeId === managerEmployeeId
      ) {
        return;
      }

      if (active) {
        active.effectiveTo = effectiveFrom;
        await repo.save(active);
      }

      await repo.save(
        repo.create({
          employeeId,
          managerEmployeeId,
          managerType: REPORTING_MANAGER_TYPE_PRIMARY,
          effectiveFrom,
          effectiveTo: undefined,
        }),
      );
    });

    const result = await this.getAssignmentForEmployee(dataSource, employeeId);
    if (!result) {
      throw new NotFoundException('Employee not found after assignment');
    }
    return result;
  }

  async remove(dataSource: DataSource, employeeId: string): Promise<void> {
    this.assertUuid(employeeId, 'Employee');
    const empRepo = dataSource.getRepository(Employee);
    const employee = await empRepo.findOne({ where: { id: employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const repo = dataSource.getRepository(EmployeeReportingManager);
    const active = await this.findActivePrimary(repo, employeeId);
    if (!active) {
      throw new NotFoundException('No active reporting manager assignment found');
    }

    active.effectiveTo = new Date().toISOString().slice(0, 10);
    await repo.save(active);
  }

  private async getActivePrimaryRow(
    dataSource: DataSource,
    employeeId: string,
  ): Promise<EmployeeReportingManager | null> {
    return this.findActivePrimary(
      dataSource.getRepository(EmployeeReportingManager),
      employeeId,
    );
  }

  private findActivePrimary(
    repo: Repository<EmployeeReportingManager>,
    employeeId: string,
  ): Promise<EmployeeReportingManager | null> {
    return repo.findOne({
      where: {
        employeeId,
        managerType: REPORTING_MANAGER_TYPE_PRIMARY,
        effectiveTo: IsNull(),
      },
    });
  }

  private async assertNoCycle(
    dataSource: DataSource,
    employeeId: string,
    managerEmployeeId: string,
  ): Promise<void> {
    const repo = dataSource.getRepository(EmployeeReportingManager);
    const visited = new Set<string>();
    let currentId: string | null = managerEmployeeId;

    while (currentId) {
      if (currentId === employeeId) {
        throw new BadRequestException(
          'This assignment would create a circular reporting chain',
        );
      }
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);
      const row = await this.findActivePrimary(repo, currentId);
      currentId = row?.managerEmployeeId ?? null;
    }
  }

  private assertUuid(value: string, label: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value.trim(),
      )
    ) {
      throw new BadRequestException(`${label} must be a valid UUID`);
    }
  }
}
