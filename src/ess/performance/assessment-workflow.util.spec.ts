import { PerformanceAssessmentStatus } from '../entities/performance-assessment.entity';
import {
  canEditSectionForRole,
  resolveViewerCapabilities,
} from './assessment-workflow.util';

describe('resolveViewerCapabilities (RBAC roles)', () => {
  it('HR Admin at MANAGER_REVIEWED gets HR_ADMIN acting role', () => {
    const result = resolveViewerCapabilities({
      isOwner: false,
      actorRoleCodes: ['HR_ADMIN', 'MANAGER'],
      status: PerformanceAssessmentStatus.MANAGER_REVIEWED,
      sectionRoleCodes: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'],
    });

    expect(result.editableByRole.HR_ADMIN).toBe(true);
    expect(result.editableByRole.MANAGER).toBe(false);
    expect(result.actingRole).toBe('HR_ADMIN');
  });

  it('Manager at SUBMITTED gets MANAGER acting role', () => {
    const result = resolveViewerCapabilities({
      isOwner: false,
      actorRoleCodes: ['MANAGER'],
      status: PerformanceAssessmentStatus.SUBMITTED,
      sectionRoleCodes: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'],
    });

    expect(result.editableByRole.MANAGER).toBe(true);
    expect(result.actingRole).toBe('MANAGER');
  });

  it('owner edits EMPLOYEE sections only in DRAFT/SUBMITTED', () => {
    const result = resolveViewerCapabilities({
      isOwner: true,
      actorRoleCodes: ['EMPLOYEE'],
      status: PerformanceAssessmentStatus.SUBMITTED,
      sectionRoleCodes: ['EMPLOYEE', 'MANAGER'],
    });

    expect(result.editableByRole.EMPLOYEE).toBe(true);
    expect(result.editableByRole.MANAGER).toBe(false);
    expect(result.actingRole).toBe('EMPLOYEE');
  });

  it('maps legacy HR section role to HR_ADMIN', () => {
    expect(
      canEditSectionForRole('HR', {
        isOwner: false,
        actorRoleCodes: ['HR_ADMIN'],
        status: PerformanceAssessmentStatus.MANAGER_REVIEWED,
      }),
    ).toBe(true);
  });
});
