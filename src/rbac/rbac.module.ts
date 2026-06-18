import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseCoreModule } from '../core/database/database-core.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlatformModule } from './entities/platform-module.entity';
import { OrganizationModuleEntitlement } from './entities/organization-module-entitlement.entity';
import { OrganizationEntitlementService } from './organization-entitlement.service';
import { AuthorizationService } from './authorization.service';
import { RbacSeedService } from './rbac-seed.service';
import { RbacAdminService } from './rbac-admin.service';
import { AccessScopeResolver } from './access-scope.resolver';
import { EmployeeScopeService } from './employee-scope.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { RbacConfigService } from './rbac-config.service';
import { RbacController } from './rbac.controller';
import { RbacTenantBootstrapService } from './rbac-tenant-bootstrap.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformModule, OrganizationModuleEntitlement]),
    DatabaseCoreModule,
    OrganizationsModule,
  ],
  controllers: [RbacController],
  providers: [
    OrganizationEntitlementService,
    AuthorizationService,
    RbacSeedService,
    RbacAdminService,
    AccessScopeResolver,
    EmployeeScopeService,
    PermissionsGuard,
    RbacConfigService,
    RbacTenantBootstrapService,
  ],
  exports: [
    OrganizationEntitlementService,
    AuthorizationService,
    RbacSeedService,
    RbacAdminService,
    AccessScopeResolver,
    EmployeeScopeService,
    PermissionsGuard,
    RbacConfigService,
  ],
})
export class RbacModule {}
