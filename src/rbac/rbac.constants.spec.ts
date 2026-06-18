import { permissionModuleCode } from './constants/platform-modules.constant';

describe('permissionModuleCode', () => {
  it('maps settings permissions to settings module', () => {
    expect(permissionModuleCode('settings.leave:write')).toBe('settings');
  });

  it('maps ess leave to leave module', () => {
    expect(permissionModuleCode('ess.leave:apply')).toBe('leave');
  });

  it('maps payroll permissions', () => {
    expect(permissionModuleCode('payroll:run')).toBe('payroll');
  });
});
