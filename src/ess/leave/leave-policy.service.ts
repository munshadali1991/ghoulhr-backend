import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Employee, EmployeeStatus } from '../../employees/employee.entity';
import { EmployeeEmploymentDetail } from '../../employees/entities/employee-employment-detail.entity';
import { LeaveConfiguration } from '../../settings/entities/leave-configuration.entity';
import { resolveEmployeeLocationId } from './utils/leave-location.util';

@Injectable()
export class LeavePolicyService {
  async getEmployeeContext(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
  ): Promise<{
    employee: Employee;
    locationId: string | null;
    employment: EmployeeEmploymentDetail | null;
  }> {
    const empRepo = dataSource.getRepository(Employee);
    // Tenant DB is already isolated; employees may have null organizationId (legacy rows).
    const employee = await empRepo.findOne({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new BadRequestException('Employee record not found');
    }

    if (employee.status === EmployeeStatus.INACTIVE) {
      throw new BadRequestException('Your account is inactive. Please contact HR.');
    }

    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new BadRequestException('Your account has been terminated.');
    }

    const employment = await dataSource
      .getRepository(EmployeeEmploymentDetail)
      .findOne({ where: { employee: { id: employeeId } } });
    const locationId = await resolveEmployeeLocationId(
      dataSource,
      organizationId,
      employment?.businessUnit,
    );

    return { employee, locationId, employment };
  }

  async getApplicablePolicies(
    dataSource: DataSource,
    organizationId: string,
    locationId: string | null,
  ): Promise<LeaveConfiguration[]> {
    const repo = dataSource.getRepository(LeaveConfiguration);
    const rows = await repo.find({
      where: [
        { organizationId, isActive: true },
        { organizationId: IsNull(), isActive: true },
      ],
      order: { sortOrder: 'ASC', name: 'ASC', id: 'ASC' },
    });

    return rows.filter((row) => {
      if (row.appliesTo === 'ALL_BRANCHES') return true;
      if (!locationId) return false;
      return row.locationId === locationId;
    });
  }

  async getPolicyForEmployee(
    dataSource: DataSource,
    organizationId: string,
    employeeId: string,
    leaveConfigurationId: string,
  ): Promise<{
    policy: LeaveConfiguration;
    locationId: string | null;
    employee: Employee;
  }> {
    const { employee, locationId } = await this.getEmployeeContext(
      dataSource,
      organizationId,
      employeeId,
    );

    const repo = dataSource.getRepository(LeaveConfiguration);
    const policy = await repo.findOne({
      where: [
        { id: leaveConfigurationId, organizationId },
        { id: leaveConfigurationId, organizationId: IsNull() },
      ],
    });

    if (!policy || !policy.isActive) {
      throw new BadRequestException('Leave type is not available');
    }

    const applicable =
      policy.appliesTo === 'ALL_BRANCHES' ||
      (locationId != null && policy.locationId === locationId);

    if (!applicable) {
      throw new BadRequestException(
        'This leave type does not apply to your work location',
      );
    }

    return { policy, locationId, employee };
  }

  mapPolicyToRules(policy: LeaveConfiguration) {
    return {
      leaveConfigurationId: policy.id,
      code: policy.code ?? undefined,
      allowHalfDay: policy.allowHalfDay !== false,
      negativeBalanceAllowed: policy.negativeBalanceAllowed ?? false,
      maxConsecutiveDays:
        policy.maxConsecutiveDays != null
          ? Number(policy.maxConsecutiveDays)
          : undefined,
      requiresSupportingDocument: policy.requiresSupportingDocument ?? false,
      supportingDocumentAfterDays:
        policy.supportingDocumentAfterDays != null
          ? Number(policy.supportingDocumentAfterDays)
          : undefined,
      weekendsCountAsLeave: policy.weekendsCountAsLeave ?? false,
      holidaysCountAsLeave: policy.holidaysCountAsLeave ?? false,
      requiresApproval: policy.requiresApproval !== false,
    };
  }
}
