import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
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

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);
  private readonly DEFAULT_ADMIN_PASSWORD = 'admin@123';

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
      // Step 1: Create organization record in master DB
      const organization = this.organizationRepo.create({
        ...dto,
        monthlySubscriptionAmount: dto.monthlySubscriptionAmount ?? 0,
        dbName,
        dbHost,
        dbUser,
        dbPassword,
      });
      savedOrganization = await this.organizationRepo.save(organization);

      this.logger.log(
        `Organization record created in master DB: ${savedOrganization.id}`,
      );

      // Step 2: Create tenant database
      await this.tenantConnectionManager.createDatabase(dbName);
      databaseCreated = true;

      this.logger.log(`Tenant database created: ${dbName}`);

      // Step 3: Run migrations on tenant database
      const tenantDataSource = await this.tenantConnectionManager.getOrCreateConnection(
        savedOrganization,
      );
      await this.migrationRunner.runMigrations(tenantDataSource);

      this.logger.log(`Migrations completed on tenant database: ${dbName}`);

      // Step 4: Create admin user in tenant DB (as employee)
      if (dto.adminEmail) {
        const adminName = dto.adminName || dto.subdomain;
        await this.employeesService.create(
          {
            globalUserId: '', // Will be updated after master DB user creation
            name: adminName,
            email: dto.adminEmail,
            role: 'ADMIN',
          },
          tenantDataSource,
        );

        this.logger.log(
          `Admin employee created in tenant DB: ${dto.adminEmail}`,
        );
      }

      // Step 5: Create default admin user in master DB
      if (dto.adminEmail) {
        try {
          const hashedPassword = this.hashPassword(this.DEFAULT_ADMIN_PASSWORD);

          const masterUser = await this.usersService.create({
            organizationId: savedOrganization.id,
            email: dto.adminEmail,
            password: hashedPassword,
            role: Role.ORG_ADMIN,
          });

          // Update employee's globalUserId
          const tenantDataSource2 = await this.tenantConnectionManager.getOrCreateConnection(
            savedOrganization,
          );
          const employee = await this.employeesService.findByEmail(
            dto.adminEmail,
            tenantDataSource2,
          );
          if (employee) {
            const employeeRepo = tenantDataSource2.getRepository(
              require('../employees/employee.entity').Employee,
            );
            employee.globalUserId = masterUser.id;
            await employeeRepo.save(employee);
          }

          this.logger.log(
            `Default admin user created for organization "${savedOrganization.subdomain}" with email: ${dto.adminEmail}`,
          );

          // Send credentials email to admin
          await this.emailService.sendAdminCredentials({
            to: dto.adminEmail,
            organizationName: savedOrganization.name,
            subdomain: savedOrganization.subdomain,
            email: dto.adminEmail,
            password: this.DEFAULT_ADMIN_PASSWORD,
          });
        } catch (error) {
          this.logger.error(
            `Failed to create admin user for organization "${savedOrganization.subdomain}": ${error.message}`,
          );
          // Don't fail organization creation if admin user creation fails
          // Admin can be created manually later
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

  findBySubdomain(subdomain: string) {
    return this.organizationRepo.findOne({ where: { subdomain } });
  }

  findById(id: string) {
    return this.organizationRepo.findOne({ where: { id } });
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
    return this.organizationRepo.save(next);
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

    const organizationGrowth = Array.from(growthMap.entries()).map(([month, count]) => ({
      month,
      count,
    }));

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
    const suffix = this.configService.get<string>('TENANT_DB_SUFFIX') || '_db';
    return `${subdomain.replace(/[^a-zA-Z0-9]/g, '_')}${suffix}`;
  }
}
