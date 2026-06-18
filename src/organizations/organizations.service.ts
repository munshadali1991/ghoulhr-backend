import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { randomBytes, scryptSync } from 'crypto';
import { Organization } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../roles/roles.enum';
import { EmailService } from '../modules/email';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { MigrationRunnerService } from '../core/database/migration-runner.service';
import { EmployeesService } from '../employees/employees.service';
import { ConfigService } from '@nestjs/config';
import { OrganizationStatus } from './organization-status.enum';
import { OrganizationEntitlementService } from '../rbac/organization-entitlement.service';
import { RbacSeedService } from '../rbac/rbac-seed.service';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  private readonly DEFAULT_ADMIN_PASSWORD = 'admin@123';
  private readonly DEFAULT_ORG_PORT_START = 6000;

  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly migrationRunner: MigrationRunnerService,
    private readonly employeesService: EmployeesService,
    private readonly configService: ConfigService,
    private readonly entitlementService: OrganizationEntitlementService,
    private readonly rbacSeedService: RbacSeedService,
  ) {}

  async create(dto: CreateOrganizationDto) {
    const exists = await this.organizationRepo.findOne({
      where: { subdomain: dto.subdomain },
    });

    if (exists) {
      throw new ConflictException('Subdomain already exists');
    }

    // Generate tenant database name
    const dbName = this.generateDbName(dto.subdomain);
    const dbHost = this.configService.get<string>('DB_HOST');
    const dbUser = this.configService.get<string>('DB_USER');
    const dbPassword = this.configService.get<string>('DB_PASS');

    let savedOrganization: Organization | null = null;
    let databaseCreated = false;

    try {
      const { enabledModules, ...orgFields } = dto;
      // Step 1: Create organization record in master DB
      const assignedOrgPort = await this.getNextOrgPort();
      const organization = this.organizationRepo.create({
        ...orgFields,
        monthlySubscriptionAmount: dto.monthlySubscriptionAmount ?? 0,
        dbName,
        dbHost,
        dbUser,
        dbPassword,
        orgPort: assignedOrgPort,
      });
      savedOrganization = await this.organizationRepo.save(organization);
      if (savedOrganization.orgPort == null) {
        // Defensive fallback: ensure orgPort is never left null on create.
        savedOrganization.orgPort = await this.getNextOrgPort();
        savedOrganization = await this.organizationRepo.save(savedOrganization);
      }

      this.logger.log(
        `Organization record created in master DB: ${savedOrganization.id}`,
      );

      // Step 2: Create tenant database
      await this.tenantConnectionManager.createDatabase(dbName);
      databaseCreated = true;

      this.logger.log(`Tenant database created: ${dbName}`);

      // Step 3: Run migrations on tenant database
      const tenantDataSource =
        await this.tenantConnectionManager.getOrCreateConnection(
          savedOrganization,
        );
      await this.migrationRunner.runMigrations(tenantDataSource);

      this.logger.log(`Migrations completed on tenant database: ${dbName}`);

      if (enabledModules?.length) {
        await this.entitlementService.setOrganizationEntitlements(
          savedOrganization.id,
          enabledModules,
        );
      } else {
        await this.entitlementService.enableAllModulesForOrganization(
          savedOrganization.id,
        );
      }
      await this.rbacSeedService.seedTenantRbac(tenantDataSource);

      const adminEmail = (savedOrganization.adminEmail || '')
        .trim()
        .toLowerCase();
      if (adminEmail) {
        const adminProvisioned = await this.ensureOrgAdminExists(
          savedOrganization,
          adminEmail,
        );
        await this.ensureOrgAdminRbacRole(savedOrganization, adminEmail);
        if (adminProvisioned) {
          await this.emailService.sendAdminCredentials({
            to: adminEmail,
            organizationName: savedOrganization.name,
            subdomain: savedOrganization.subdomain,
            email: adminEmail,
            password: this.DEFAULT_ADMIN_PASSWORD,
          });
        }
      }

      return savedOrganization;
    } catch (error) {
      this.logger.error(
        `Failed to create organization "${dto.subdomain}": ${error.message}`,
      );

      // Rollback: Drop tenant database if it was created
      if (databaseCreated && dbName) {
        try {
          await this.tenantConnectionManager.dropDatabase(dbName);
          this.logger.log(`Rolled back: Dropped tenant database ${dbName}`);
        } catch (dropError) {
          this.logger.error(
            `Failed to drop tenant database ${dbName} during rollback: ${dropError.message}`,
          );
        }
      }

      // Rollback: Delete organization record from master DB
      if (savedOrganization) {
        try {
          await this.organizationRepo.delete(savedOrganization.id);
          this.logger.log(
            `Rolled back: Deleted organization record ${savedOrganization.id}`,
          );
        } catch (deleteError) {
          this.logger.error(
            `Failed to delete organization record during rollback: ${deleteError.message}`,
          );
        }
      }

      throw error;
    }
  }

  findAll() {
    return this.organizationRepo.find();
  }

  findAllActive() {
    return this.organizationRepo.find({
      where: { status: OrganizationStatus.ACTIVE },
    });
  }

  findBySubdomain(subdomain: string) {
    return this.organizationRepo.findOne({ where: { subdomain } });
  }

  findByOrgPort(orgPort: number) {
    return this.organizationRepo.findOne({ where: { orgPort } });
  }

  findById(id: string) {
    return this.organizationRepo.findOne({ where: { id } });
  }

  async ensureAllOrganizationsRuntimeReady() {
    const organizations = await this.findAllActive();
    if (organizations.length === 0) {
      this.logger.log('No active organizations found for startup bootstrap');
      return;
    }

    this.logger.log(
      `Bootstrapping runtime for ${organizations.length} organizations`,
    );

    for (const organization of organizations) {
      try {
        await this.ensureOrganizationRuntimeReady(organization);
      } catch (error) {
        this.logger.error(
          `Failed to bootstrap organization "${organization.subdomain}": ${error.message}`,
        );
      }
    }
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    const existing = await this.organizationRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    if (dto.subdomain && dto.subdomain !== existing.subdomain) {
      const subdomainExists = await this.organizationRepo.findOne({
        where: { subdomain: dto.subdomain },
      });
      if (subdomainExists) {
        throw new ConflictException('Subdomain already exists');
      }
    }

    const next = this.organizationRepo.merge(existing, {
      ...dto,
      monthlySubscriptionAmount:
        dto.monthlySubscriptionAmount !== undefined
          ? dto.monthlySubscriptionAmount
          : existing.monthlySubscriptionAmount,
    });
    const missingTenantCredentials =
      this.isMissingValue(existing.dbName) ||
      this.isMissingValue(existing.dbHost) ||
      this.isMissingValue(existing.dbUser) ||
      this.isMissingValue(existing.dbPassword);
    if (missingTenantCredentials) {
      next.dbName = this.isMissingValue(existing.dbName)
        ? this.generateDbName(next.subdomain || existing.subdomain)
        : existing.dbName;
      next.dbHost = this.isMissingValue(existing.dbHost)
        ? this.configService.get<string>('DB_HOST')
        : existing.dbHost;
      next.dbUser = this.isMissingValue(existing.dbUser)
        ? this.configService.get<string>('DB_USER')
        : existing.dbUser;
      next.dbPassword = this.isMissingValue(existing.dbPassword)
        ? this.configService.get<string>('DB_PASS')
        : existing.dbPassword;
    }

    if (existing.orgPort == null) {
      next.orgPort = await this.getNextOrgPort();
    }

    const saved = await this.organizationRepo.save(next);

    if (missingTenantCredentials && saved.dbName) {
      await this.tenantConnectionManager.createDatabase(saved.dbName);
      const tenantDataSource =
        await this.tenantConnectionManager.getOrCreateConnection(saved);
      await this.migrationRunner.runMigrations(tenantDataSource);
    }

    const adminEmail = (saved.adminEmail || '').trim().toLowerCase();
    if (adminEmail) {
      await this.ensureOrgAdminExists(saved, adminEmail);
      await this.ensureOrgAdminRbacRole(saved, adminEmail);
    }

    return saved;
  }

  async remove(id: string) {
    const existing = await this.organizationRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Organization not found');
    }

    await this.organizationRepo.softDelete(id);
    return { success: true };
  }

  findDeleted() {
    return this.organizationRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      order: { deletedAt: 'DESC' },
    });
  }

  async restore(id: string) {
    const existing = await this.organizationRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!existing || !existing.deletedAt) {
      throw new NotFoundException('Deleted organization not found');
    }

    await this.organizationRepo.restore(id);
    return { success: true };
  }

  async getSuperAdminStats() {
    const organizations = await this.organizationRepo.find({
      select: ['id', 'status', 'monthlySubscriptionAmount', 'createdAt'],
    });
    const totalOrganizations = organizations.length;
    const totalUsers = await this.userRepo.count();
    const totalRevenue = organizations.reduce((acc, org) => {
      return acc + Number(org.monthlySubscriptionAmount ?? 0);
    }, 0);

    const now = new Date();
    const growthMap = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      growthMap.set(key, 0);
    }

    organizations.forEach((org) => {
      const d = new Date(org.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (growthMap.has(key)) {
        growthMap.set(key, (growthMap.get(key) ?? 0) + 1);
      }
    });

    const organizationGrowth = Array.from(growthMap.entries()).map(
      ([month, count]) => ({
        month,
        count,
      }),
    );

    return {
      totalOrganizations,
      totalUsers,
      totalRevenue,
      organizationGrowth,
    };
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private generateDbName(subdomain: string): string {
    return subdomain.trim().toLowerCase();
  }

  private isMissingValue(value?: string | null): boolean {
    if (value == null) {
      return true;
    }

    const normalized = value.trim().toLowerCase();
    return (
      normalized.length === 0 ||
      normalized === 'null' ||
      normalized === 'undefined'
    );
  }

  private async getNextOrgPort(): Promise<number> {
    const configuredStart = Number(
      this.configService.get<string>('ORG_PORT_START'),
    );
    const basePort =
      Number.isFinite(configuredStart) && configuredStart > 0
        ? configuredStart
        : this.DEFAULT_ORG_PORT_START;

    const result = await this.organizationRepo
      .createQueryBuilder('organization')
      .withDeleted()
      .select('MAX(organization.orgPort)', 'max')
      .getRawOne<{ max: string | null }>();

    const currentMax = Number(result?.max);
    if (!Number.isFinite(currentMax)) {
      return basePort;
    }

    return Math.max(currentMax + 1, basePort);
  }

  private async ensureOrganizationRuntimeReady(
    organization: Organization,
  ): Promise<void> {
    let next = organization;
    let changed = false;

    if (this.isMissingValue(next.dbName)) {
      next.dbName = this.generateDbName(next.subdomain);
      changed = true;
    }
    if (this.isMissingValue(next.dbHost)) {
      next.dbHost = this.configService.get<string>('DB_HOST');
      changed = true;
    }
    if (this.isMissingValue(next.dbUser)) {
      next.dbUser = this.configService.get<string>('DB_USER');
      changed = true;
    }
    if (this.isMissingValue(next.dbPassword)) {
      next.dbPassword = this.configService.get<string>('DB_PASS');
      changed = true;
    }
    if (next.orgPort == null) {
      next.orgPort = await this.getNextOrgPort();
      changed = true;
    }

    if (changed) {
      next = await this.organizationRepo.save(next);
      this.logger.log(
        `Backfilled runtime config for "${next.subdomain}" (db: ${next.dbName}, port: ${next.orgPort})`,
      );
    }

    await this.tenantConnectionManager.createDatabase(next.dbName);
    const tenantDataSource =
      await this.tenantConnectionManager.getOrCreateConnection(next);
    await this.migrationRunner.runMigrations(tenantDataSource);
    await this.entitlementService.ensureEntitlementsExist(next.id);
    await this.rbacSeedService.seedTenantRbac(tenantDataSource);

    const adminEmail = (next.adminEmail || '').trim().toLowerCase();
    if (adminEmail) {
      await this.ensureOrgAdminExists(next, adminEmail);
      await this.ensureOrgAdminRbacRole(next, adminEmail);
    }
  }

  private async ensureOrgAdminRbacRole(
    organization: Organization,
    adminEmail: string,
  ): Promise<void> {
    try {
      const tenantDataSource =
        await this.tenantConnectionManager.getOrCreateConnection(organization);
      const employee = await this.employeesService.findByEmail(
        adminEmail,
        tenantDataSource,
      );
      if (!employee) {
        return;
      }
      await this.rbacSeedService.assignPrimarySystemRole(
        tenantDataSource,
        employee.id,
        'ORG_ADMIN',
      );
    } catch (error) {
      this.logger.warn(
        `ORG_ADMIN RBAC assignment failed for "${organization.subdomain}": ${error.message}`,
      );
    }
  }

  private async ensureOrgAdminExists(
    organization: Organization,
    adminEmail: string,
  ): Promise<boolean> {
    const existingOrgAdmin = await this.userRepo.findOne({
      where: {
        organizationId: organization.id,
        role: Role.ORG_ADMIN,
      },
    });

    const tenantDataSource =
      await this.tenantConnectionManager.getOrCreateConnection(organization);
    const existingEmployee = await this.employeesService.findByEmail(
      adminEmail,
      tenantDataSource,
    );

    if (existingEmployee) {
      await this.employeesService.syncOrgAdminInitialPassword(
        existingEmployee.id,
        this.DEFAULT_ADMIN_PASSWORD,
        tenantDataSource,
      );
    }

    if (existingOrgAdmin) {
      return false;
    }

    const emailUser = await this.userRepo.findOne({
      where: {
        organizationId: organization.id,
        email: adminEmail,
      },
    });
    if (emailUser) {
      emailUser.role = Role.ORG_ADMIN;
      await this.userRepo.save(emailUser);
      return true;
    }

    const masterUser = await this.usersService.create({
      organizationId: organization.id,
      email: adminEmail,
      password: this.hashPassword(this.DEFAULT_ADMIN_PASSWORD),
      role: Role.ORG_ADMIN,
    });

    try {
      if (!existingEmployee) {
        await this.employeesService.create(
          {
            name: organization.adminName || organization.subdomain,
            email: adminEmail,
            role: 'ORG_ADMIN' as any,
            initialPassword: this.DEFAULT_ADMIN_PASSWORD,
          },
          tenantDataSource,
          masterUser.id,
        );
      }
    } catch (error) {
      this.logger.warn(
        `ORG_ADMIN user created but employee sync failed for "${organization.subdomain}": ${error.message}`,
      );
    }

    return true;
  }
}
