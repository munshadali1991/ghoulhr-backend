import { permissionModuleCode } from './constants/platform-modules.constant';

describe('permissionModuleCode', () => {
  it('maps settings permissions to settings module', () => {
    expect(permissionModuleCode('settings.leave:write')).toBe('settings');
    expect(permissionModuleCode('settings.performance:write')).toBe('settings');
  });

  it('maps ess leave to leave module', () => {
    expect(permissionModuleCode('ess.leave:apply')).toBe('leave');
  });

  it('maps payroll permissions', () => {
    expect(permissionModuleCode('payroll:run')).toBe('payroll');
  });

  it('maps document centre permissions', () => {
    expect(permissionModuleCode('ess.documents:read')).toBe('documents');
    expect(permissionModuleCode('documents:write')).toBe('documents');
  });

  it('maps ess skills to employees module', () => {
    expect(permissionModuleCode('ess.skills:read')).toBe('employees');
    expect(permissionModuleCode('ess.skills:write')).toBe('employees');
    expect(permissionModuleCode('settings.skills:write')).toBe('settings');
    expect(permissionModuleCode('employees.skills:read')).toBe('employees');
  });
});
