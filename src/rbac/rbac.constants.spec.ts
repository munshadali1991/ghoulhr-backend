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

  it('maps expense permissions to expense module', () => {
    expect(permissionModuleCode('ess.expense:apply')).toBe('expense');
    expect(permissionModuleCode('settings.expense:write')).toBe('expense');
    expect(permissionModuleCode('expense.finance:act')).toBe('expense');
    expect(permissionModuleCode('approvals.expense:read')).toBe('approvals');
  });
});
