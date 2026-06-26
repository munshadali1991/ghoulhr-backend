import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OrganizationsService } from '../organizations/organizations.service';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { MigrationRunnerService } from '../core/database/migration-runner.service';
import { OrganizationEntitlementService } from './organization-entitlement.service';
import { RbacSeedService } from './rbac-seed.service';

/**
 * Ensures RBAC is seeded for all tenant databases on startup.
 */
@Injectable()
export class RbacTenantBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RbacTenantBootstrapService.name);

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly migrationRunner: MigrationRunnerService,
    private readonly entitlementService: OrganizationEntitlementService,
    private readonly rbacSeedService: RbacSeedService,
  ) {}

  async onModuleInit() {
    try {
      await this.entitlementService.syncPlatformModulesFromCatalog();
      const orgs = await this.organizationsService.findAll();
      for (const org of orgs) {
        try {
          await this.entitlementService.ensureEntitlementsExist(org.id);
          await this.entitlementService.ensureMissingModuleEntitlements(org.id);
          const ds = await this.tenantConnectionManager.getOrCreateConnection(org);
          await this.migrationRunner.runMigrations(ds);
          await this.rbacSeedService.seedTenantRbac(ds);
        } catch (err) {
          this.logger.warn(
            `RBAC bootstrap skipped for org ${org.subdomain}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`RBAC tenant bootstrap failed: ${(err as Error).message}`);
    }
  }
}
