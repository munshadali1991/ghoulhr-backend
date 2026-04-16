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
  ) {}

  async create(dto: CreateOrganizationDto) {
    const exists = await this.organizationRepo.findOne({
      where: { subdomain: dto.subdomain },
    });

    if (exists) {
      throw new ConflictException('Subdomain already exists');
    }

    // Create organization first
    const organization = this.organizationRepo.create({
      ...dto,
      monthlySubscriptionAmount: dto.monthlySubscriptionAmount ?? 0,
    });
    const savedOrganization = await this.organizationRepo.save(organization);

    // Create default admin user if admin email is provided
    if (dto.adminEmail) {
      try {
        const hashedPassword = this.hashPassword(this.DEFAULT_ADMIN_PASSWORD);
        
        await this.usersService.create({
          organizationId: savedOrganization.id,
          email: dto.adminEmail,
          password: hashedPassword,
          role: Role.ORG_ADMIN,
        });

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
}
