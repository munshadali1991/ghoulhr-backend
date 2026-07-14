import { PerformanceAssessmentStatus } from '../entities/performance-assessment.entity';

export const MANAGER_CLASS_ROLES = new Set(['MANAGER', 'TEAM_LEAD']);
export const HR_CLASS_ROLES = new Set(['HR_ADMIN', 'ORG_ADMIN']);

export interface ViewerCapabilitiesInput {
  isOwner: boolean;
  actorRoleCodes: string[];
  status: PerformanceAssessmentStatus;
  sectionRoleCodes: string[];
}

export interface ViewerCapabilities {
  editableEmployee: boolean;
  editableManager: boolean;
  editableHr: boolean;
  editableByRole: Record<string, boolean>;
  actingRole: string | null;
}

/** Map legacy section role codes to RBAC role codes. */
export function normalizeSectionRoleCode(code: string): string {
  if (code === 'HR') return 'HR_ADMIN';
  return code;
}

export function isManagerClassRole(code: string): boolean {
  return MANAGER_CLASS_ROLES.has(normalizeSectionRoleCode(code));
}

export function isHrClassRole(code: string): boolean {
  return HR_CLASS_ROLES.has(normalizeSectionRoleCode(code));
}

function actingRolePriority(code: string): number {
  const role = normalizeSectionRoleCode(code);
  if (role === 'EMPLOYEE') return 0;
  if (isManagerClassRole(role)) return 1;
  if (isHrClassRole(role)) return 2;
  return 3;
}

/** Whether the actor may edit a section assigned to the given RBAC role code. */
export function canEditSectionForRole(
  sectionRoleCode: string,
  input: Omit<ViewerCapabilitiesInput, 'sectionRoleCodes'>,
): boolean {
  const role = normalizeSectionRoleCode(sectionRoleCode);
  const { isOwner, actorRoleCodes, status } = input;

  if (role === 'EMPLOYEE') {
    return (
      isOwner &&
      (status === PerformanceAssessmentStatus.DRAFT ||
        status === PerformanceAssessmentStatus.SUBMITTED)
    );
  }

  if (isOwner) {
    return false;
  }

  if (!actorRoleCodes.includes(role)) {
    return false;
  }

  if (isManagerClassRole(role)) {
    return status === PerformanceAssessmentStatus.SUBMITTED;
  }

  if (isHrClassRole(role)) {
    return status === PerformanceAssessmentStatus.MANAGER_REVIEWED;
  }

  return (
    status === PerformanceAssessmentStatus.SUBMITTED ||
    status === PerformanceAssessmentStatus.MANAGER_REVIEWED
  );
}

export function resolveActingRole(
  sectionRoleCodes: string[],
  input: Omit<ViewerCapabilitiesInput, 'sectionRoleCodes'>,
): string | null {
  const editable = [
    ...new Set(sectionRoleCodes.map((c) => normalizeSectionRoleCode(c))),
  ].filter((code) => canEditSectionForRole(code, input));

  if (!editable.length) {
    return null;
  }

  editable.sort((a, b) => actingRolePriority(a) - actingRolePriority(b));
  return editable[0];
}

/** Workflow + RBAC: section editability and current acting role. */
export function resolveViewerCapabilities(
  input: ViewerCapabilitiesInput,
): ViewerCapabilities {
  const uniqueRoles = [
    ...new Set(input.sectionRoleCodes.map((c) => normalizeSectionRoleCode(c))),
  ];

  const editableByRole: Record<string, boolean> = {};
  for (const code of uniqueRoles) {
    editableByRole[code] = canEditSectionForRole(code, input);
  }

  const actingRole = resolveActingRole(input.sectionRoleCodes, input);

  return {
    editableByRole,
    actingRole,
    editableEmployee: Boolean(editableByRole.EMPLOYEE),
    editableManager: uniqueRoles.some(
      (code) => isManagerClassRole(code) && editableByRole[code],
    ),
    editableHr: uniqueRoles.some(
      (code) => isHrClassRole(code) && editableByRole[code],
    ),
  };
}

/** Map RBAC acting role to answer storage / API review kind. */
export function resolveReviewKind(
  actingRole: string,
): 'employee' | 'manager' | 'hr' | 'custom' {
  const role = normalizeSectionRoleCode(actingRole);
  if (role === 'EMPLOYEE') return 'employee';
  if (isManagerClassRole(role)) return 'manager';
  if (isHrClassRole(role)) return 'hr';
  return 'custom';
}
