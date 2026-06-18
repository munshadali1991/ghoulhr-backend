/** Platform-level module catalog (Layer 1 — super admin entitlements). */
export const PLATFORM_MODULES = [
  { code: 'employees', name: 'Employees', description: 'Employee records and HR onboarding' },
  { code: 'settings', name: 'Organization Settings', description: 'Org profile and configuration' },
  { code: 'leave', name: 'Leave Management', description: 'Leave policies and ESS leave' },
  { code: 'attendance', name: 'Attendance', description: 'Attendance tracking and policies' },
  { code: 'timesheet', name: 'Timesheet', description: 'Timesheet entry and configuration' },
  { code: 'payroll', name: 'Payroll', description: 'Payroll processing' },
  { code: 'tracking', name: 'Tracking', description: 'Employee tracking module' },
  { code: 'approvals', name: 'Approvals', description: 'Leave and timesheet approvals' },
  { code: 'rbac', name: 'Roles & Permissions', description: 'Tenant RBAC administration' },
] as const;

export type PlatformModuleCode = (typeof PLATFORM_MODULES)[number]['code'];

export const ALL_PLATFORM_MODULE_CODES: PlatformModuleCode[] =
  PLATFORM_MODULES.map((m) => m.code);

/** Maps a permission code prefix to its platform module. */
export function permissionModuleCode(permissionCode: string): string {
  if (permissionCode.startsWith('settings.')) {
    return 'settings';
  }
  if (permissionCode.startsWith('ess.')) {
    if (permissionCode.startsWith('ess.leave')) return 'leave';
    if (permissionCode.startsWith('ess.attendance')) return 'attendance';
    if (permissionCode.startsWith('ess.timesheet')) return 'timesheet';
    return 'settings';
  }
  if (permissionCode.startsWith('approvals.')) {
    if (permissionCode.startsWith('approvals.leave')) return 'approvals';
    if (permissionCode.startsWith('approvals.timesheet')) return 'approvals';
    return 'approvals';
  }
  if (permissionCode.startsWith('employees')) {
    return 'employees';
  }
  if (permissionCode.startsWith('payroll')) {
    return 'payroll';
  }
  if (permissionCode.startsWith('rbac')) {
    return 'rbac';
  }
  return permissionCode.split(':')[0] ?? permissionCode;
}
