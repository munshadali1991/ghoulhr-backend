import { permissionModuleCode } from './platform-modules.constant';

export interface PermissionDefinition {
  code: string;
  moduleCode: string;
  action: string;
  description: string;
}

function perm(
  code: string,
  action: string,
  description: string,
): PermissionDefinition {
  return {
    code,
    moduleCode: permissionModuleCode(code),
    action,
    description,
  };
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // Employees
  perm('employees:read', 'read', 'View employee records'),
  perm('employees:create', 'create', 'Create employees'),
  perm('employees:update', 'update', 'Update employee records'),
  perm('employees:onboard', 'onboard', 'HR onboarding wizard'),
  perm('employees:reset-password', 'reset-password', 'Reset employee passwords'),
  perm('employees:reporting-manager:read', 'read', 'View reporting manager assignments'),
  perm('employees:reporting-manager:assign', 'assign', 'Assign reporting managers'),

  // Settings
  perm('settings.organization:read', 'read', 'View organization profile settings'),
  perm('settings.organization:write', 'write', 'Update organization profile settings'),
  perm('settings.employees:read', 'read', 'View employee module settings'),
  perm('settings.employees:write', 'write', 'Update employee module settings'),
  perm('settings.attendance:read', 'read', 'View attendance settings'),
  perm('settings.attendance:write', 'write', 'Update attendance settings'),
  perm('settings.timesheet:read', 'read', 'View timesheet settings'),
  perm('settings.timesheet:write', 'write', 'Update timesheet settings'),
  perm('settings.locations:read', 'read', 'View location configurations'),
  perm('settings.locations:write', 'write', 'Update location configurations'),
  perm('settings.leave:read', 'read', 'View leave configurations'),
  perm('settings.leave:write', 'write', 'Update leave configurations'),

  // ESS
  perm('ess.leave:read', 'read', 'View own leave data'),
  perm('ess.leave:apply', 'apply', 'Apply for leave'),
  perm('ess.attendance:read', 'read', 'View own attendance'),
  perm('ess.attendance:punch', 'punch', 'Sign in/out attendance'),
  perm('ess.timesheet:read', 'read', 'View own timesheet'),
  perm('ess.timesheet:write', 'write', 'Edit own timesheet entries'),

  // Approvals
  perm('approvals.leave:read', 'read', 'View leave requests pending approval'),
  perm('approvals.leave:act', 'act', 'Approve or reject leave requests'),
  perm('approvals.timesheet:read', 'read', 'View timesheets pending approval'),
  perm('approvals.timesheet:act', 'act', 'Approve or reject timesheets'),

  // Payroll
  perm('payroll:read', 'read', 'View payroll data'),
  perm('payroll:write', 'write', 'Manage payroll configuration'),
  perm('payroll:run', 'run', 'Run payroll processing'),

  // RBAC admin
  perm('rbac:read', 'read', 'View roles and permissions'),
  perm('rbac:manage', 'manage', 'Manage roles, permissions, and assignments'),
];

export const ALL_PERMISSION_CODES = PERMISSION_CATALOG.map((p) => p.code);

export interface SystemRoleDefinition {
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
  isSystem: boolean;
}

const ESS_PERMISSIONS = [
  'ess.leave:read',
  'ess.leave:apply',
  'ess.attendance:read',
  'ess.attendance:punch',
  'ess.timesheet:read',
  'ess.timesheet:write',
];

const MANAGER_PERMISSIONS = [
  ...ESS_PERMISSIONS,
  'employees:read',
  'employees:reporting-manager:read',
  'approvals.leave:read',
  'approvals.leave:act',
  'approvals.timesheet:read',
  'approvals.timesheet:act',
];

const HR_ADMIN_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'employees:create',
  'employees:update',
  'employees:onboard',
  'employees:reset-password',
  'employees:reporting-manager:assign',
  'settings.employees:read',
  'settings.employees:write',
  'settings.organization:read',
  'settings.locations:read',
  'settings.locations:write',
  'settings.leave:read',
  'settings.leave:write',
  'settings.attendance:read',
  'settings.attendance:write',
];

const PAYROLL_ADMIN_PERMISSIONS = [
  ...ESS_PERMISSIONS,
  'employees:read',
  'payroll:read',
  'payroll:write',
  'payroll:run',
];

const ORG_ADMIN_PERMISSIONS = [...ALL_PERMISSION_CODES];

export const SYSTEM_ROLES: SystemRoleDefinition[] = [
  {
    code: 'ORG_ADMIN',
    name: 'Organization Admin',
    description: 'Full administrative access within entitled modules',
    permissionCodes: ORG_ADMIN_PERMISSIONS,
    isSystem: true,
  },
  {
    code: 'HR_ADMIN',
    name: 'HR Admin',
    description: 'HR operations, employee management, and HR settings',
    permissionCodes: HR_ADMIN_PERMISSIONS,
    isSystem: true,
  },
  {
    code: 'PAYROLL_ADMIN',
    name: 'Payroll Admin',
    description: 'Payroll operations and employee read access',
    permissionCodes: PAYROLL_ADMIN_PERMISSIONS,
    isSystem: true,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Team management, approvals, and self-service',
    permissionCodes: MANAGER_PERMISSIONS,
    isSystem: true,
  },
  {
    code: 'TEAM_LEAD',
    name: 'Team Lead',
    description: 'Limited manager capabilities',
    permissionCodes: [
      ...ESS_PERMISSIONS,
      'employees:read',
      'approvals.leave:read',
      'approvals.leave:act',
    ],
    isSystem: true,
  },
  {
    code: 'EMPLOYEE',
    name: 'Employee',
    description: 'Employee self-service only',
    permissionCodes: ESS_PERMISSIONS,
    isSystem: true,
  },
];

/** Map legacy portalRoleLabel to system role code. */
export function portalRoleLabelToRoleCode(label: string | undefined | null): string {
  const u = (label || '').toUpperCase();
  if (u === 'HR') return 'HR_ADMIN';
  if (u === 'PAYROLL') return 'PAYROLL_ADMIN';
  if (u === 'ADMIN') return 'ORG_ADMIN';
  if (u === 'MANAGER') return 'MANAGER';
  return 'EMPLOYEE';
}

/** Map legacy EmployeeRole enum to primary system role code. */
export function employeeRoleToRoleCode(role: string): string {
  if (role === 'ORG_ADMIN') return 'ORG_ADMIN';
  if (role === 'MANAGER') return 'MANAGER';
  return 'EMPLOYEE';
}
