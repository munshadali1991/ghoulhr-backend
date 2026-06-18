import { AccessScope } from '../constants/access-scope.enum';

const SCOPE_RANK: Record<AccessScope, number> = {
  [AccessScope.SELF]: 1,
  [AccessScope.TEAM]: 2,
  [AccessScope.DEPARTMENT]: 3,
  [AccessScope.ORGANIZATION]: 4,
  [AccessScope.GLOBAL]: 5,
};

/** Union semantics: most permissive scope wins across roles. */
export function maxAccessScope(scopes: AccessScope[]): AccessScope {
  if (scopes.length === 0) return AccessScope.SELF;
  return scopes.reduce(
    (max, scope) => (SCOPE_RANK[scope] > SCOPE_RANK[max] ? scope : max),
    AccessScope.SELF,
  );
}

export function isAccessScope(value: string): value is AccessScope {
  return Object.values(AccessScope).includes(value as AccessScope);
}

export function parseAccessScope(value: string | undefined | null): AccessScope {
  if (value && isAccessScope(value)) return value;
  return AccessScope.SELF;
}
