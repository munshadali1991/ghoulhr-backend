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
  perm('employees.skills:read', 'read', 'View employee skill profiles'),

  // Settings
  perm('settings.organization:read', 'read', 'View organization profile settings'),
  perm('settings.organization:write', 'write', 'Update organization profile settings'),
  perm('settings.employees:read', 'read', 'View employee module settings'),
  perm('settings.employees:write', 'write', 'Update employee module settings'),
  perm('settings.departments:read', 'read', 'View departments'),
  perm('settings.departments:write', 'write', 'Create and update departments'),
  perm('settings.designations:read', 'read', 'View designations'),
  perm('settings.designations:write', 'write', 'Create and update designations'),
  perm('settings.attendance:read', 'read', 'View attendance settings'),
  perm('settings.attendance:write', 'write', 'Update attendance settings'),
  perm('settings.timesheet:read', 'read', 'View timesheet settings'),
  perm('settings.timesheet:write', 'write', 'Update timesheet settings'),
  perm('settings.locations:read', 'read', 'View location configurations'),
  perm('settings.locations:write', 'write', 'Update location configurations'),
  perm('settings.leave:read', 'read', 'View leave configurations'),
  perm('settings.leave:write', 'write', 'Update leave configurations'),
  perm('settings.performance:read', 'read', 'View performance assessment master'),
  perm('settings.performance:write', 'write', 'Update performance assessment master'),
  perm('settings.skills:read', 'read', 'View skills master'),
  perm('settings.skills:write', 'write', 'Create and update skills master'),

  // ESS
  perm('ess.leave:read', 'read', 'View own leave data'),
  perm('ess.leave:apply', 'apply', 'Apply for leave'),
  perm('ess.attendance:read', 'read', 'View own attendance'),
  perm('ess.attendance:punch', 'punch', 'Sign in/out attendance'),
  perm(
    'ess.attendance.swipes:read',
    'read',
    'View employee swipe history for people in scope',
  ),
  perm(
    'ess.attendance.regularization:apply',
    'apply',
    'Submit and withdraw own attendance regularization requests',
  ),
  perm('ess.timesheet:read', 'read', 'View own timesheet'),
  perm('ess.timesheet:write', 'write', 'Edit own timesheet entries'),
  perm('ess.performance:read', 'read', 'View own performance assessments'),
  perm('ess.performance:write', 'write', 'Complete own self-assessment'),
  perm('ess.documents:read', 'read', 'View own Form 16 and company documents'),
  perm('ess.skills:read', 'read', 'View own skills'),
  perm('ess.skills:write', 'write', 'Add and update own skills'),

  // Document Centre (HR)
  perm('documents:read', 'read', 'View all Document Centre records including confidential'),
  perm('documents:write', 'write', 'Upload and manage Document Centre files'),

  // Approvals
  perm('approvals.leave:read', 'read', 'View leave requests pending approval'),
  perm('approvals.leave:act', 'act', 'Approve or reject leave requests'),
  perm('approvals.timesheet:read', 'read', 'View timesheets pending approval'),
  perm('approvals.timesheet:act', 'act', 'Approve or reject timesheets'),
  perm(
    'approvals.attendance:read',
    'read',
    'View attendance regularization requests pending approval',
  ),
  perm(
    'approvals.attendance:act',
    'act',
    'Approve or reject attendance regularization requests',
  ),

  // Performance (Manager & HR review)
  perm('performance.review:read', 'read', 'View team performance assessments'),
  perm('performance.review:act', 'act', 'Complete manager performance review'),
  perm('performance.hr:read', 'read', 'View performance assessments for HR review'),
  perm('performance.hr:act', 'act', 'Complete HR performance feedback'),

  // Payroll
  perm('payroll:read', 'read', 'View payroll data'),
  perm('payroll:write', 'write', 'Manage payroll configuration'),
  perm('payroll:run', 'run', 'Run payroll processing'),

  // Dashboards
  perm('dashboard.ess:read', 'read', 'View employee home dashboard'),
  perm(
    'dashboard.ess.team-on-leave:read',
    'read',
    'View Team On Leave card on Employee home (approved leave for people in scope)',
  ),
  perm(
    'dashboard.ess.track:read',
    'read',
    'View Track card on Employee home (own pending leave applications)',
  ),
  perm(
    'dashboard.ess.who-is-in:read',
    'read',
    'View Who is in card and attendance roster for people in scope',
  ),
  perm('dashboard.hr:read', 'read', 'View HR organization dashboard'),
  perm('dashboard.manager:read', 'read', 'View manager dashboard'),
  perm('dashboard.payroll:read', 'read', 'View payroll dashboard'),
  perm('dashboard.approvals:read', 'read', 'View approvals dashboard'),

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
  'ess.attendance.regularization:apply',
  'ess.timesheet:read',
  'ess.timesheet:write',
  'ess.performance:read',
  'ess.performance:write',
  'ess.documents:read',
  'ess.skills:read',
  'ess.skills:write',
  'dashboard.ess:read',
  'dashboard.ess.track:read',
];

const MANAGER_PERMISSIONS = [
  ...ESS_PERMISSIONS,
  'employees:read',
  'employees.skills:read',
  'employees:reporting-manager:read',
  'approvals.leave:read',
  'approvals.leave:act',
  'approvals.timesheet:read',
  'approvals.timesheet:act',
  'approvals.attendance:read',
  'approvals.attendance:act',
  'performance.review:read',
  'performance.review:act',
  'dashboard.manager:read',
  'dashboard.approvals:read',
  'dashboard.ess.team-on-leave:read',
  'dashboard.ess.who-is-in:read',
  'ess.attendance.swipes:read',
];

const HR_ADMIN_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'employees:create',
  'employees:update',
  'employees:onboard',
  'employees:reset-password',
  'employees:reporting-manager:assign',
  'performance.hr:read',
  'performance.hr:act',
  'dashboard.hr:read',
  'settings.employees:read',
  'settings.employees:write',
  'settings.departments:read',
  'settings.departments:write',
  'settings.designations:read',
  'settings.designations:write',
  'settings.organization:read',
  'settings.locations:read',
  'settings.locations:write',
  'settings.leave:read',
  'settings.leave:write',
  'settings.performance:read',
  'settings.performance:write',
  'settings.skills:read',
  'settings.skills:write',
  'settings.attendance:read',
  'settings.attendance:write',
  'documents:read',
  'documents:write',
];

const PAYROLL_ADMIN_PERMISSIONS = [
  ...ESS_PERMISSIONS,
  'employees:read',
  'payroll:read',
  'payroll:write',
  'payroll:run',
  'dashboard.payroll:read',
  'dashboard.hr:read',
  'documents:read',
  'documents:write',
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
      'employees.skills:read',
      'approvals.leave:read',
      'approvals.leave:act',
      'approvals.attendance:read',
      'approvals.attendance:act',
      'dashboard.approvals:read',
      'dashboard.ess.team-on-leave:read',
      'dashboard.ess.who-is-in:read',
      'ess.attendance.swipes:read',
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
