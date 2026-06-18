import { AccessScope } from './access-scope.enum';

/**
 * Default access scope per system role and permission code.
 * Custom roles default to SELF unless set in the RBAC admin UI.
 */
export function getDefaultAccessScope(
  roleCode: string,
  permissionCode: string,
): AccessScope {
  if (roleCode === 'ORG_ADMIN') {
    return AccessScope.ORGANIZATION;
  }

  if (permissionCode.startsWith('ess.')) {
    return AccessScope.SELF;
  }

  if (permissionCode.startsWith('rbac:')) {
    return roleCode === 'ORG_ADMIN' ? AccessScope.ORGANIZATION : AccessScope.SELF;
  }

  if (permissionCode.startsWith('settings.')) {
    if (roleCode === 'HR_ADMIN') return AccessScope.ORGANIZATION;
    return AccessScope.SELF;
  }

  if (permissionCode.startsWith('payroll:')) {
    if (roleCode === 'ORG_ADMIN' || roleCode === 'PAYROLL_ADMIN') {
      return AccessScope.ORGANIZATION;
    }
    return AccessScope.SELF;
  }

  if (permissionCode.startsWith('approvals.')) {
    if (roleCode === 'HR_ADMIN' || roleCode === 'ORG_ADMIN') {
      return AccessScope.ORGANIZATION;
    }
    if (roleCode === 'MANAGER' || roleCode === 'TEAM_LEAD') {
      return AccessScope.TEAM;
    }
    return AccessScope.SELF;
  }

  if (permissionCode.startsWith('employees')) {
    if (roleCode === 'HR_ADMIN' || roleCode === 'PAYROLL_ADMIN') {
      return AccessScope.ORGANIZATION;
    }
    if (roleCode === 'MANAGER' || roleCode === 'TEAM_LEAD') {
      if (permissionCode === 'employees:update') {
        return roleCode === 'MANAGER' ? AccessScope.TEAM : AccessScope.SELF;
      }
      return AccessScope.TEAM;
    }
    return AccessScope.SELF;
  }

  return AccessScope.SELF;
}
