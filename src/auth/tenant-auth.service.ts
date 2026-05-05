import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Employee, EmployeeStatus } from '../employees/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { PasswordService } from '../common/services/password.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from '../employees/dto/create-employee.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { TenantConnectionManager } from '../core/database/tenant-connection.manager';
import { AuthService } from './auth.service';
import { RefreshSessionService } from './refresh-session.service';

export interface TenantEmployeeLoginResponse {
  accessToken: string;
  refreshPlain: string;
  user: {
    id: string;
    employeeCode: string;
    email: string;
    name: string;
    role: string;
    mustChangePassword: boolean;
    organizationSubdomain?: string;
  };
  requiresPasswordChange?: boolean;
}

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger(TenantAuthService.name);

  constructor(
    private readonly employeesService: EmployeesService,
    private readonly passwordService: PasswordService,
    private readonly organizationsService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly authService: AuthService,
    private readonly refreshSessionService: RefreshSessionService,
  ) {}

  /**
   * Authenticate tenant employee login
   */
  async login(
    dto: LoginDto,
    tenantDataSource: DataSource,
    organization: any,
  ): Promise<TenantEmployeeLoginResponse> {
    const email = dto.email.toLowerCase().trim();

    let employee: Employee | null = null;
    let targetOrganization: any = organization;
    let targetDataSource = tenantDataSource;

    // If subdomain is provided in DTO, use it to find the organization
    if (dto.subdomain) {
      this.logger.log(`Subdomain provided in login request: ${dto.subdomain}`);
      
      try {
        // Find organization by subdomain
        targetOrganization = await this.organizationsService.findBySubdomain(dto.subdomain);
        
        if (!targetOrganization) {
          this.logger.error(`Organization not found for subdomain: ${dto.subdomain}`);
          throw new UnauthorizedException('Invalid credentials');
        }
        
        // Get or create tenant data source for this organization
        targetDataSource = await this.getTenantDataSource(targetOrganization);
        this.logger.log(`✓ Connected to organization: ${targetOrganization.subdomain} - ${targetOrganization.dbName}`);
      } catch (error) {
        this.logger.error(`Failed to connect to organization ${dto.subdomain}: ${error.message}`);
        throw new UnauthorizedException('Invalid credentials');
      }
    }
    // If tenantDataSource is provided (from middleware), try to find employee in that tenant first
    // If not found, search across all organizations (fallback for automatic detection)
    else if (tenantDataSource && organization) {
      this.logger.log(`Tenant context provided: ${organization.subdomain}, attempting login...`);
      
      // Try to find employee in the current tenant
      employee = await this.employeesService.findByEmail(email, tenantDataSource);
      
      if (!employee) {
        this.logger.log(`Employee not found in ${organization.subdomain}, searching all organizations...`);
        
        // Fallback: Search through all organizations
        const allOrganizations = await this.organizationsService.findAll();
        this.logger.log(`Found ${allOrganizations.length} organizations to search`);
        
        for (const org of allOrganizations) {
          try {
            this.logger.log(`Checking organization: ${org.subdomain} (${org.dbName})`);
            const orgDataSource = await this.getTenantDataSource(org);
            const foundEmployee = await this.employeesService.findByEmail(email, orgDataSource);
            
            if (foundEmployee) {
              employee = foundEmployee;
              targetOrganization = org;
              targetDataSource = orgDataSource;
              this.logger.log(`✓ Found employee in organization: ${org.subdomain} - Role: ${foundEmployee.role}`);
              break;
            } else {
              this.logger.log(`✗ No employee found in ${org.subdomain}`);
            }
          } catch (error) {
            // Skip organizations that can't be connected
            this.logger.warn(`Skipping organization ${org.subdomain}: ${error.message}`);
            continue;
          }
        }

        if (!employee) {
          this.logger.error(`Employee not found in any organization for email: ${email}`);
          throw new UnauthorizedException('Invalid credentials');
        }
      }
    }
    // If tenantDataSource is not provided (e.g., from root domain), find organization by email
    else if (!tenantDataSource) {
      this.logger.log(`No tenant data source provided, finding organization by email: ${email}`);
      
      // Find the organization by searching through all organizations
      const allOrganizations = await this.organizationsService.findAll();
      this.logger.log(`Found ${allOrganizations.length} organizations to search`);
      
      for (const org of allOrganizations) {
        try {
          this.logger.log(`Checking organization: ${org.subdomain} (${org.dbName})`);
          const orgDataSource = await this.getTenantDataSource(org);
          const foundEmployee = await this.employeesService.findByEmail(email, orgDataSource);
          
          if (foundEmployee) {
            employee = foundEmployee;
            targetOrganization = org;
            targetDataSource = orgDataSource;
            this.logger.log(`✓ Found employee in organization: ${org.subdomain} - Role: ${foundEmployee.role}`);
            break;
          } else {
            this.logger.log(`✗ No employee found in ${org.subdomain}`);
          }
        } catch (error) {
          // Skip organizations that can't be connected
          this.logger.warn(`Skipping organization ${org.subdomain}: ${error.message}`);
          continue;
        }
      }

      if (!employee) {
        this.logger.error(`Employee not found in any organization for email: ${email}`);
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Find employee in tenant database if not already found
    if (!employee) {
      employee = await this.employeesService.findByEmail(email, targetDataSource);
    }

    if (!employee) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await this.passwordService.verifyPassword(
      dto.password,
      employee.password,
    );

    if (!isPasswordValid) {
      // Record failed login attempt
      await this.employeesService.recordFailedLogin(employee.id, targetDataSource);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check account status
    if (employee.status === EmployeeStatus.INACTIVE) {
      throw new ForbiddenException('Your account is inactive. Please contact HR.');
    }

    if (employee.status === EmployeeStatus.TERMINATED) {
      throw new ForbiddenException('Your account has been terminated.');
    }

    // PENDING_ACTIVATION is allowed - employee needs to login to activate account and change password

    // Check if account is locked
    if (employee.lockedUntil && employee.lockedUntil > new Date()) {
      const lockoutMinutes = Math.ceil(
        (employee.lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Account is locked. Please try again in ${lockoutMinutes} minutes.`,
      );
    }

    // Record successful login
    await this.employeesService.recordLogin(employee.id, targetDataSource);

    const accessToken = this.authService.mintAccessToken({
      sub: employee.id,
      organizationId: targetOrganization.id,
      organizationSubdomain: targetOrganization.subdomain,
      email: employee.email,
      role: employee.role,
      employeeCode: employee.employeeCode,
      name: employee.name,
    });

    const refreshExpires = this.authService.getRefreshExpiryDate();
    const { plain: refreshPlain } = await this.refreshSessionService.issueEmployeeSession(
      employee.id,
      targetOrganization.id,
      refreshExpires,
    );

    const response: TenantEmployeeLoginResponse = {
      accessToken,
      refreshPlain,
      user: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        email: employee.email,
        name: employee.name,
        role: employee.role,
        mustChangePassword: employee.mustChangePassword,
        organizationSubdomain: targetOrganization.subdomain,
      },
    };

    // Check if password change is required
    if (employee.mustChangePassword) {
      response.requiresPasswordChange = true;
    }

    return response;
  }

  /**
   * Get or create tenant data source for an organization
   */
  private async getTenantDataSource(organization: any): Promise<DataSource> {
    return this.tenantConnectionManager.getOrCreateConnection(organization);
  }

  /**
   * Change password (first login or manual change)
   */
  async changePassword(
    employeeId: string,
    dto: ChangePasswordDto,
    tenantDataSource: DataSource,
  ): Promise<{ message: string; mustChangePassword: boolean }> {
    const employee = await this.employeesService.findById(employeeId, tenantDataSource);

    if (!employee) {
      throw new UnauthorizedException('Employee not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.passwordService.verifyPassword(
      dto.currentPassword,
      employee.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password strength
    const validation = this.passwordService.validatePasswordStrength(dto.newPassword);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Update password
    await this.employeesService.updatePassword(employeeId, dto.newPassword, tenantDataSource);

    this.logger.log(`Password changed successfully for employee ${employeeId}`);

    return {
      message: 'Password changed successfully',
      mustChangePassword: false,
    };
  }
}
