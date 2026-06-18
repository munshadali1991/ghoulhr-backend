import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationModuleEntitlement } from './entities/organization-module-entitlement.entity';
import { PlatformModule } from './entities/platform-module.entity';
import { ALL_PLATFORM_MODULE_CODES } from './constants/platform-modules.constant';

@Injectable()
export class OrganizationEntitlementService {
  private readonly cache = new Map<string, { modules: string[]; expiresAt: number }>();
  private readonly cacheTtlMs = 60_000;

  constructor(
    @InjectRepository(OrganizationModuleEntitlement)
    private readonly entitlementRepo: Repository<OrganizationModuleEntitlement>,
    @InjectRepository(PlatformModule)
    private readonly moduleRepo: Repository<PlatformModule>,
  ) {}

  async listPlatformModules(): Promise<PlatformModule[]> {
    return this.moduleRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  async getEntitledModuleCodes(organizationId: string): Promise<string[]> {
    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.modules;
    }

    const rows = await this.entitlementRepo.find({
      where: { organizationId, enabled: true },
    });

    const modules = rows.map((r) => r.moduleCode);
    this.cache.set(organizationId, {
      modules,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return modules;
  }

  async hasModuleEntitlement(
    organizationId: string,
    moduleCode: string,
  ): Promise<boolean> {
    const entitled = await this.getEntitledModuleCodes(organizationId);
    return entitled.includes(moduleCode);
  }

  async getOrganizationEntitlements(organizationId: string) {
    const modules = await this.listPlatformModules();
    const entitlements = await this.entitlementRepo.find({
      where: { organizationId },
    });
    const map = new Map(entitlements.map((e) => [e.moduleCode, e]));

    return modules.map((mod) => {
      const ent = map.get(mod.code);
      return {
        moduleCode: mod.code,
        moduleName: mod.name,
        description: mod.description,
        enabled: ent?.enabled ?? false,
        enabledAt: ent?.enabledAt ?? null,
        expiresAt: ent?.expiresAt ?? null,
      };
    });
  }

  async setOrganizationEntitlements(
    organizationId: string,
    moduleCodes: string[],
    enabledBy?: string,
  ) {
    const validCodes = new Set(ALL_PLATFORM_MODULE_CODES);
    const unique = [...new Set(moduleCodes.filter((c) => validCodes.has(c as any)))];

    for (const code of ALL_PLATFORM_MODULE_CODES) {
      const enabled = unique.includes(code);
      let row = await this.entitlementRepo.findOne({
        where: { organizationId, moduleCode: code },
      });
      if (!row) {
        row = this.entitlementRepo.create({
          organizationId,
          moduleCode: code,
          enabled,
          enabledAt: enabled ? new Date() : undefined,
          enabledBy: enabled ? enabledBy : undefined,
        });
      } else {
        row.enabled = enabled;
        row.enabledAt = enabled ? new Date() : row.enabledAt;
        row.enabledBy = enabled ? enabledBy : row.enabledBy;
      }
      await this.entitlementRepo.save(row);
    }

    this.invalidateCache(organizationId);
    return this.getOrganizationEntitlements(organizationId);
  }

  async enableAllModulesForOrganization(organizationId: string, enabledBy?: string) {
    return this.setOrganizationEntitlements(
      organizationId,
      [...ALL_PLATFORM_MODULE_CODES],
      enabledBy,
    );
  }

  /** Enable all modules only when the organization has no entitlement rows yet. */
  async ensureEntitlementsExist(organizationId: string, enabledBy?: string) {
    const count = await this.entitlementRepo.count({
      where: { organizationId },
    });
    if (count === 0) {
      return this.enableAllModulesForOrganization(organizationId, enabledBy);
    }
    return this.getOrganizationEntitlements(organizationId);
  }

  invalidateCache(organizationId: string) {
    this.cache.delete(organizationId);
  }
}
