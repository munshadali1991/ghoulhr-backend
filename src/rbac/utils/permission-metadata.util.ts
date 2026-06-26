import { PLATFORM_MODULES } from '../constants/platform-modules.constant';
import { RbacPermission } from '../entities/rbac-permission.entity';

const ACTION_LABELS: Record<string, string> = {
  read: 'View',
  create: 'Create',
  update: 'Update',
  write: 'Edit',
  onboard: 'Onboard',
  'reset-password': 'Reset password',
  assign: 'Assign',
  apply: 'Apply',
  punch: 'Punch',
  act: 'Approve',
  run: 'Run',
  manage: 'Manage',
};

const MODULE_NAME_BY_CODE = new Map(
  PLATFORM_MODULES.map((m) => [m.code, m.name]),
);

/** Extract resource segment from permission code (e.g. employees:read → employees). */
export function permissionResource(code: string): string {
  const colonIdx = code.indexOf(':');
  if (colonIdx === -1) return code;
  return code.slice(0, colonIdx);
}

export function permissionActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.charAt(0).toUpperCase() + action.slice(1);
}

export function permissionModuleName(moduleCode: string): string {
  return MODULE_NAME_BY_CODE.get(moduleCode as (typeof PLATFORM_MODULES)[number]['code'])
    ?? moduleCode;
}

export function enrichPermission(perm: RbacPermission) {
  return {
    ...perm,
    resource: permissionResource(perm.code),
    actionLabel: permissionActionLabel(perm.action),
    moduleName: permissionModuleName(perm.moduleCode),
  };
}

/** Human-readable resource label from permission code prefix. */
export function permissionResourceLabel(code: string): string {
  const resource = permissionResource(code);
  const labels: Record<string, string> = {
    employees: 'Employees',
    'settings.organization': 'Organization profile',
    'settings.employees': 'Employee settings',
    'settings.departments': 'Departments',
    'settings.designations': 'Designations',
    'settings.attendance': 'Attendance settings',
    'settings.timesheet': 'Timesheet settings',
    'settings.locations': 'Locations',
    'settings.leave': 'Leave settings',
    'ess.leave': 'ESS Leave',
    'ess.attendance': 'ESS Attendance',
    'ess.timesheet': 'ESS Timesheet',
    'approvals.leave': 'Leave approvals',
    'approvals.timesheet': 'Timesheet approvals',
    payroll: 'Payroll',
    rbac: 'Roles & Permissions',
    'dashboard.ess': 'Employee home dashboard',
    'dashboard.hr': 'HR organization dashboard',
    'dashboard.manager': 'Manager dashboard',
    'dashboard.payroll': 'Payroll dashboard',
    'dashboard.approvals': 'Approvals dashboard',
  };
  return labels[resource] ?? resource.replace(/\./g, ' / ').replace(/-/g, ' ');
}
