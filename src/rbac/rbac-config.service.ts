import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RbacConfigService {
  constructor(private readonly config: ConfigService) {}

  isRbacEnforced(): boolean {
    return this.config.get<string>('RBAC_ENFORCED', 'true') !== 'false';
  }

  isSettingsEnforced(): boolean {
    if (!this.isRbacEnforced()) return false;
    return this.config.get<string>('RBAC_SETTINGS_ENFORCED', 'true') !== 'false';
  }

  isEmployeesEnforced(): boolean {
    if (!this.isRbacEnforced()) return false;
    return this.config.get<string>('RBAC_EMPLOYEES_ENFORCED', 'true') !== 'false';
  }

  /** Permission + scope resolver (department-aware authorization). */
  isScopeV2Enabled(): boolean {
    return this.config.get<string>('RBAC_SCOPE_V2', 'false') === 'true';
  }
}
