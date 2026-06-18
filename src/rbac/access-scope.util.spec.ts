import { AccessScope } from './constants/access-scope.enum';
import { maxAccessScope } from './utils/access-scope.util';
import { getDefaultAccessScope } from './constants/role-permission-scopes.constant';

describe('maxAccessScope', () => {
  it('returns most permissive scope (union semantics)', () => {
    expect(
      maxAccessScope([AccessScope.SELF, AccessScope.TEAM, AccessScope.DEPARTMENT]),
    ).toBe(AccessScope.DEPARTMENT);
    expect(
      maxAccessScope([AccessScope.TEAM, AccessScope.ORGANIZATION]),
    ).toBe(AccessScope.ORGANIZATION);
    expect(maxAccessScope([AccessScope.SELF])).toBe(AccessScope.SELF);
  });
});

describe('getDefaultAccessScope', () => {
  it('maps MANAGER employees:read to TEAM', () => {
    expect(getDefaultAccessScope('MANAGER', 'employees:read')).toBe(
      AccessScope.TEAM,
    );
  });

  it('maps HR_ADMIN employees:read to ORGANIZATION', () => {
    expect(getDefaultAccessScope('HR_ADMIN', 'employees:read')).toBe(
      AccessScope.ORGANIZATION,
    );
  });

  it('maps ORG_ADMIN to ORGANIZATION for any permission', () => {
    expect(getDefaultAccessScope('ORG_ADMIN', 'payroll:run')).toBe(
      AccessScope.ORGANIZATION,
    );
  });

  it('maps ESS permissions to SELF', () => {
    expect(getDefaultAccessScope('MANAGER', 'ess.leave:apply')).toBe(
      AccessScope.SELF,
    );
  });

  it('maps PAYROLL_ADMIN payroll to ORGANIZATION', () => {
    expect(getDefaultAccessScope('PAYROLL_ADMIN', 'payroll:read')).toBe(
      AccessScope.ORGANIZATION,
    );
  });
});
