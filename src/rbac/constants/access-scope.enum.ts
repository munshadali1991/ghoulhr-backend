/** Data visibility scope for a role-permission grant. */
export enum AccessScope {
  SELF = 'SELF',
  TEAM = 'TEAM',
  DEPARTMENT = 'DEPARTMENT',
  ORGANIZATION = 'ORGANIZATION',
  GLOBAL = 'GLOBAL',
}

export const ACCESS_SCOPE_VALUES = Object.values(AccessScope);
