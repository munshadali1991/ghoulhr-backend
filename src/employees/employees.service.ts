import { Injectable, ConflictException, Logger, BadRequestException } from '@nestjs/common';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Employee, EmployeeRole, EmployeeStatus } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import {
  CheckEmployeeDuplicateDto,
  EmployeeOnboardingCreateDto,
} from './dto/employee-onboarding.dto';
import { PasswordService } from '../common/services/password.service';
import { FieldEncryptionService } from '../common/services/field-encryption.service';
import { SettingsService } from '../settings/settings.service';
import { EmployeeEmploymentDetail } from './entities/employee-employment-detail.entity';
import { EmployeeSalaryDetail } from './entities/employee-salary-detail.entity';
import { EmployeeBankDetail } from './entities/employee-bank-detail.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeAccessControl } from './entities/employee-access.entity';
import { EmployeeAuditLog } from './entities/employee-audit-log.entity';
import { EmployeeEmergencyContact } from './entities/employee-emergency-contact.entity';

export interface CreateEmployeeResult {
  employee: Employee;
  temporaryPassword: string;
  passwordExpiresAt: Date;
}

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly passwordService: PasswordService,
    private readonly settingsService: SettingsService,
    private readonly fieldEncryption: FieldEncryptionService,
  ) {}

  /**
   * Create a new employee in tenant database with settings integration
   */
  async create(
    dto: CreateEmployeeDto,
    dataSource: DataSource,
    createdBy: string,
  ): Promise<CreateEmployeeResult> {
    const repo = dataSource.getRepository(Employee);

    // Step 1: Validate email exists
    if (!dto.email) {
      throw new BadRequestException('Email is required');
    }

    // Step 2: Fetch employee settings
    const employeeSettings = await this.settingsService.getEmployeeSettings(dataSource);
    this.logger.log(`Employee settings loaded: ${JSON.stringify(employeeSettings)}`);

    // Step 3: Validate required fields from settings
    await this.validateRequiredFields(dto, employeeSettings);

    // Step 4: Check email uniqueness
    const email = dto.email.toLowerCase().trim();
    const existing = await repo.findOne({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('Employee already exists with this email');
    }

    // Step 4: Generate employee code
    const employeeCode = await this.generateEmployeeCode(
      repo,
      employeeSettings,
    );

    // Step 5: Generate temporary password
    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const hashedPassword = await this.passwordService.hashPassword(temporaryPassword);
    const passwordExpiresAt = this.passwordService.getTempPasswordExpiry();

    // Step 6: Calculate probation end date if settings exist
    const probationEndDate = this.calculateProbationEndDate(
      dto.dateOfJoining,
      employeeSettings,
    );

    // Step 7: Create employee record
    const employee = repo.create({
      employeeCode,
      name: dto.name,
      email,
      password: hashedPassword,
      role: dto.role || EmployeeRole.EMPLOYEE,
      status: EmployeeStatus.PENDING_ACTIVATION,
      department: dto.department,
      designation: dto.designation,
      phoneNumber: dto.phoneNumber,
      dateOfBirth: dto.dateOfBirth,
      dateOfJoining: dto.dateOfJoining,
      probationEndDate,
      address: dto.address,
      emergencyContact: dto.emergencyContact,
      bloodGroup: dto.bloodGroup,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      ifscCode: dto.ifscCode,
      panNumber: dto.panNumber,
      aadhaarNumber: dto.aadhaarNumber,
      uanNumber: dto.uanNumber,
      esiNumber: dto.esiNumber,
      pfNumber: dto.pfNumber,
      mustChangePassword: true,
      createdBy,
    });

    const savedEmployee = await repo.save(employee);

    this.logger.log(
      `Employee created: ${savedEmployee.employeeCode} (${savedEmployee.email})`,
    );

    return {
      employee: savedEmployee,
      temporaryPassword,
      passwordExpiresAt,
    };
  }

  async checkDuplicates(
    dto: CheckEmployeeDuplicateDto,
    dataSource: DataSource,
  ): Promise<{ emailTaken: boolean; mobileTaken: boolean }> {
    const repo = dataSource.getRepository(Employee);
    const emails = [dto.personalEmail, dto.officialEmail]
      .filter((e): e is string => !!e?.trim())
      .map((e) => e.toLowerCase().trim());
    let emailTaken = false;
    if (emails.length) {
      const count = await repo
        .createQueryBuilder('e')
        .where('LOWER(e.email) IN (:...emails)', { emails })
        .orWhere('LOWER(COALESCE(e.personalEmail, \'\')) IN (:...emails)', { emails })
        .orWhere('LOWER(COALESCE(e.officialEmail, \'\')) IN (:...emails)', { emails })
        .getCount();
      emailTaken = count > 0;
    }
    let mobileTaken = false;
    const mobileNorm = dto.mobileNumber?.replace(/\D/g, '') ?? '';
    if (mobileNorm.length >= 8) {
      const rows = await repo
        .createQueryBuilder('e')
        .select(['e.phoneNumber', 'e.alternateMobile'])
        .getMany();
      mobileTaken = rows.some((r) => {
        const p = (r.phoneNumber || '').replace(/\D/g, '');
        const a = (r.alternateMobile || '').replace(/\D/g, '');
        return p === mobileNorm || a === mobileNorm;
      });
    }
    return { emailTaken, mobileTaken };
  }

  async createHrOnboarding(
    dto: EmployeeOnboardingCreateDto,
    dataSource: DataSource,
    actorId: string,
  ): Promise<CreateEmployeeResult> {
    const actorUuid = this.requireActorUuid(actorId);
    const { basic, employment, payroll, bank, compliance, emergencyContact, documents, access } = dto;
    const loginEmail = (basic.officialEmail?.trim() || basic.personalEmail.trim()).toLowerCase();
    const personalEmail = basic.personalEmail.toLowerCase().trim();
    const officialEmail = basic.officialEmail?.trim().toLowerCase() || undefined;

    const repo = dataSource.getRepository(Employee);
    const existing = await repo.findOne({ where: { email: loginEmail } });
    if (existing) {
      throw new ConflictException('Employee already exists with this login email');
    }

    const employeeSettings = await this.settingsService.getEmployeeSettings(dataSource);
    const fullName = [basic.firstName, basic.middleName, basic.lastName].filter(Boolean).join(' ').trim();

    await this.validateRequiredFields(
      {
        name: fullName,
        email: loginEmail,
        phoneNumber: basic.mobileNumber,
        department: employment.department,
        designation: employment.designation,
        dateOfJoining: employment.dateOfJoining,
      } as CreateEmployeeDto,
      employeeSettings,
    );

    if (
      bank?.accountNumber &&
      bank?.confirmAccountNumber &&
      bank.accountNumber.trim() !== bank.confirmAccountNumber.trim()
    ) {
      throw new BadRequestException('Account number confirmation does not match');
    }

    const ecName = emergencyContact?.contactName?.trim() ?? '';
    const ecPhone = emergencyContact?.contactPhone?.trim() ?? '';
    const ecRel = emergencyContact?.relationship?.trim() ?? '';
    const ecAny = ecName || ecPhone || ecRel;
    const ecAll = ecName && ecPhone && ecRel;
    if (ecAny && !ecAll) {
      throw new BadRequestException(
        'Emergency contact: enter name, contact number, and relationship together, or leave all empty.',
      );
    }

    const employeeCode = await this.generateEmployeeCode(repo, employeeSettings);
    const temporaryPassword =
      access.temporaryPassword?.trim() || this.passwordService.generateTemporaryPassword();
    const hashedPassword = await this.passwordService.hashPassword(temporaryPassword);
    const passwordExpiresAt = this.passwordService.getTempPasswordExpiry();
    const role = this.mapPortalRoleToEmployeeRole(access.portalRoleLabel);

    let probationEndDate = this.calculateProbationEndDate(
      employment.dateOfJoining,
      employeeSettings,
    );
    if (employment.probationPeriodDays != null && employment.dateOfJoining) {
      const d = new Date(employment.dateOfJoining);
      d.setDate(d.getDate() + employment.probationPeriodDays);
      probationEndDate = d;
    }

    const panEnc = compliance?.panNumber?.trim()
      ? this.fieldEncryption.encrypt(compliance.panNumber.toUpperCase().trim())
      : null;
    const aadhaarEnc = compliance?.aadhaarNumber?.trim()
      ? this.fieldEncryption.encrypt(compliance.aadhaarNumber.replace(/\s/g, ''))
      : null;

    let savedEmployee: Employee;
    try {
      savedEmployee = await dataSource.transaction(async (em) => {
      const empRepo = em.getRepository(Employee);
      const emp = empRepo.create({
        employeeCode,
        name: fullName,
        email: loginEmail,
        password: hashedPassword,
        role,
        status: EmployeeStatus.PENDING_ACTIVATION,
        department: employment.department,
        designation: employment.designation,
        phoneNumber: basic.mobileNumber,
        dateOfBirth: basic.dateOfBirth,
        dateOfJoining: employment.dateOfJoining,
        probationEndDate,
        firstName: basic.firstName,
        middleName: basic.middleName,
        lastName: basic.lastName,
        gender: basic.gender,
        personalEmail,
        officialEmail,
        alternateMobile: basic.alternateMobile,
        profilePhotoUrl: basic.profilePhotoUrl,
        panNumberEnc: panEnc,
        aadhaarNumberEnc: aadhaarEnc,
        passportNumber: compliance?.passportNumber,
        passportExpiry: compliance?.passportExpiry,
        uanNumber: compliance?.uanNumber,
        esiNumber: compliance?.esicNumber,
        pfNumber: compliance?.pfNumber,
        mustChangePassword: true,
        createdBy: actorUuid,
      });
      const saved = await empRepo.save(emp);

      await em.getRepository(EmployeeEmploymentDetail).save(
        em.getRepository(EmployeeEmploymentDetail).create({
          employee: saved,
          employmentType: employment.employmentType,
          employmentStatus: employment.employmentStatus,
          reportingManagerId: this.optionalUuidField(
            employment.reportingManagerId,
            'Reporting manager',
          ),
          hrManagerId: this.optionalUuidField(employment.hrManagerId, 'HR manager'),
          workLocation: employment.workLocation,
          workMode: employment.workMode,
          shift: employment.shift,
          probationPeriodDays: employment.probationPeriodDays,
          noticePeriodDays: employment.noticePeriodDays,
          businessUnit: employment.businessUnit,
          team: employment.team,
          gradeBand: employment.gradeBand,
          costCenter: employment.costCenter,
        }),
      );

      if (payroll && (payroll.ctc != null || payroll.basicSalary != null || payroll.salaryStructure)) {
        await em.getRepository(EmployeeSalaryDetail).save(
          em.getRepository(EmployeeSalaryDetail).create({
            employee: saved,
            ctc: payroll.ctc != null ? String(payroll.ctc) : undefined,
            salaryStructure: payroll.salaryStructure,
            basicSalary: payroll.basicSalary != null ? String(payroll.basicSalary) : undefined,
            hra: payroll.hra != null ? String(payroll.hra) : undefined,
            allowancesJson: payroll.allowances,
            pfApplicable: payroll.pfApplicable ?? true,
            esicApplicable: payroll.esicApplicable ?? false,
            taxRegime: payroll.taxRegime,
          }),
        );
      }

      if (bank && (bank.accountNumber || bank.bankName)) {
        const accEnc = bank.accountNumber?.trim()
          ? this.fieldEncryption.encrypt(bank.accountNumber.trim())
          : null;
        await em.getRepository(EmployeeBankDetail).save(
          em.getRepository(EmployeeBankDetail).create({
            employee: saved,
            accountHolderName: bank.accountHolderName,
            bankName: bank.bankName,
            accountNumberEnc: accEnc,
            accountLastFour: bank.accountNumber
              ? this.fieldEncryption.lastFour(bank.accountNumber)
              : null,
            ifscCode: bank.ifscCode,
            branchName: bank.branchName,
            verificationStatus: bank.verificationStatus || 'PENDING',
          }),
        );
      }

      if (ecAll) {
        await em.getRepository(EmployeeEmergencyContact).save(
          em.getRepository(EmployeeEmergencyContact).create({
            employee: saved,
            contactName: ecName,
            contactPhone: ecPhone,
            relationship: ecRel,
          }),
        );
      }

      if (documents?.length) {
        const docRepo = em.getRepository(EmployeeDocument);
        for (const d of documents.slice(0, 20)) {
          if (!d.dataBase64) continue;
          const approxBytes = Math.floor((d.dataBase64.length * 3) / 4);
          if (approxBytes > 5 * 1024 * 1024) {
            throw new BadRequestException(`Document ${d.fileName} exceeds size limit`);
          }
          await docRepo.save(
            docRepo.create({
              employee: saved,
              documentType: d.documentType,
              fileName: d.fileName,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
              storageDriver: 'inline_base64',
              payloadEnc: this.fieldEncryption.encrypt(d.dataBase64),
              uploadedBy: actorUuid,
              verificationStatus: 'PENDING',
            }),
          );
        }
      }

      await em.getRepository(EmployeeAccessControl).save(
        em.getRepository(EmployeeAccessControl).create({
          employee: saved,
          hrmsAccessEnabled: access.hrmsAccessEnabled ?? true,
          welcomeEmailEnabled: access.welcomeEmailEnabled ?? false,
          mfaEnabled: access.mfaEnabled ?? false,
          portalRoleLabel: access.portalRoleLabel,
        }),
      );

      await em.getRepository(EmployeeAuditLog).save(
        em.getRepository(EmployeeAuditLog).create({
          employee: saved,
          actorId: actorUuid,
          action: 'HR_ONBOARDING_CREATE',
          metadata: { employeeCode: saved.employeeCode, email: saved.email },
        }),
      );

      return saved;
    });
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ConflictException) {
        throw err;
      }
      if (err instanceof QueryFailedError) {
        const driver = err.driverError as { code?: string; message?: string } | undefined;
        const code = driver?.code;
        const msg = (driver?.message || err.message || '').toString();
        this.logger.error(`HR onboarding failed: ${msg}`);
        if (code === '42P01' || msg.includes('does not exist')) {
          throw new BadRequestException(
            'Tenant database is missing onboarding tables. Run tenant migrations for this organization (employee onboarding module), then retry.',
          );
        }
        if (code === '22P02' || msg.includes('invalid input syntax for type uuid')) {
          throw new BadRequestException(
            'A value was rejected as an invalid UUID (often an empty manager id or session id). Clear manager fields or sign in again.',
          );
        }
      }
      throw err;
    }

    this.logger.log(`HR onboarding created: ${savedEmployee.employeeCode} (${savedEmployee.email})`);

    return {
      employee: savedEmployee,
      temporaryPassword,
      passwordExpiresAt,
    };
  }

  /** JWT `sub` and several satellite columns are PostgreSQL uuid — reject bad values before INSERT. */
  private requireActorUuid(actorId: string): string {
    const t = (actorId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
      throw new BadRequestException(
        'Invalid performer id on token (expected UUID). Sign out and sign in again, then retry.',
      );
    }
    return t;
  }

  private optionalUuidField(value: string | undefined, label: string): string | undefined {
    if (value == null || String(value).trim() === '') return undefined;
    const t = String(value).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
      throw new BadRequestException(`${label} must be a valid employee id (UUID) or left empty.`);
    }
    return t;
  }

  private mapPortalRoleToEmployeeRole(label: string): EmployeeRole {
    const u = (label || '').toUpperCase();
    if (u === 'MANAGER') return EmployeeRole.MANAGER;
    if (['HR', 'PAYROLL', 'ADMIN'].includes(u)) return EmployeeRole.ORG_ADMIN;
    return EmployeeRole.EMPLOYEE;
  }

  /**
   * Validate required fields based on organization settings
   */
  private async validateRequiredFields(
    dto: CreateEmployeeDto,
    settings: Record<string, any>,
  ): Promise<void> {
    const requiredFields = settings.required_fields;
    if (!requiredFields || !Array.isArray(requiredFields)) {
      return; // No required fields configured
    }

    const missingFields: string[] = [];

    for (const field of requiredFields) {
      switch (field) {
        case 'name':
          if (!dto.name) missingFields.push('name');
          break;
        case 'email':
          if (!dto.email) missingFields.push('email');
          break;
        case 'phone':
          if (!dto.phoneNumber) missingFields.push('phoneNumber');
          break;
        case 'department':
          if (!dto.department) missingFields.push('department');
          break;
        case 'position':
          if (!dto.designation) missingFields.push('designation');
          break;
        case 'hire_date':
          if (!dto.dateOfJoining) missingFields.push('dateOfJoining');
          break;
      }
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Missing required fields: ${missingFields.join(', ')}`,
      );
    }
  }

  /**
   * Generate employee code based on settings
   */
  private async generateEmployeeCode(
    repo: Repository<Employee>,
    settings: Record<string, any>,
  ): Promise<string> {
    const autoGenerate = settings.auto_generate_id ?? true;
    const prefix = settings.id_prefix || 'EMP';

    if (!autoGenerate) {
      // If auto-generate is disabled, admin should provide employeeCode
      // This will be handled in the controller
      throw new BadRequestException(
        'Manual employee code generation not yet implemented. Please enable auto_generate_id in settings.',
      );
    }

    // Get current year
    const year = new Date().getFullYear();

    // Find the highest sequence number for this year and prefix
    const pattern = `${prefix}-${year}%`;
    const lastEmployee = await repo
      .createQueryBuilder('employee')
      .where('employee.employeeCode LIKE :pattern', { pattern })
      .orderBy('employee.employeeCode', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastEmployee) {
      // Extract sequence from last employee code (e.g., "ACME-2026-0045" -> 45)
      const parts = lastEmployee.employeeCode.split('-');
      if (parts.length === 3) {
        sequence = parseInt(parts[2], 10) + 1;
      }
    }

    // Format: PREFIX-YEAR-SEQUENCE (e.g., ACME-2026-0001)
    const paddedSequence = sequence.toString().padStart(4, '0');
    return `${prefix}-${year}-${paddedSequence}`;
  }

  /**
   * Calculate probation end date based on settings
   */
  private calculateProbationEndDate(
    dateOfJoining: Date | undefined,
    settings: Record<string, any>,
  ): Date | undefined {
    if (!dateOfJoining) {
      return undefined;
    }

    const probationPeriod = settings.default_probation_period;
    if (!probationPeriod || typeof probationPeriod !== 'number') {
      return undefined;
    }

    const probationEndDate = new Date(dateOfJoining);
    probationEndDate.setDate(probationEndDate.getDate() + probationPeriod);

    return probationEndDate;
  }

  /**
   * Find employee by email in tenant database
   */
  async findByEmail(email: string, dataSource: DataSource): Promise<Employee | null> {
    const repo = dataSource.getRepository(Employee);
    return repo.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  /**
   * Find employee by ID
   */
  async findById(id: string, dataSource: DataSource): Promise<Employee | null> {
    const repo = dataSource.getRepository(Employee);
    return repo.findOne({ where: { id } });
  }

  /**
   * Find employee by employee code
   */
  async findByEmployeeCode(
    employeeCode: string,
    dataSource: DataSource,
  ): Promise<Employee | null> {
    const repo = dataSource.getRepository(Employee);
    return repo.findOne({ where: { employeeCode } });
  }

  /**
   * Find all employees in tenant database
   */
  async findAll(dataSource: DataSource): Promise<Employee[]> {
    const repo = dataSource.getRepository(Employee);
    return repo.find({
      order: { createdAt: 'DESC' },
      select: [
        'id',
        'employeeCode',
        'name',
        'email',
        'role',
        'status',
        'department',
        'designation',
        'dateOfJoining',
        'createdAt',
      ],
    });
  }

  /**
   * Update employee password
   */
  async updatePassword(
    employeeId: string,
    newPassword: string,
    dataSource: DataSource,
  ): Promise<void> {
    const repo = dataSource.getRepository(Employee);
    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    await repo.update(employeeId, {
      password: hashedPassword,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    });
  }

  /**
   * Reset employee password (admin action)
   */
  async resetPassword(
    employeeId: string,
    dataSource: DataSource,
  ): Promise<{ temporaryPassword: string; expiresAt: Date }> {
    const repo = dataSource.getRepository(Employee);
    const employee = await repo.findOne({ where: { id: employeeId } });

    if (!employee) {
      throw new BadRequestException('Employee not found');
    }

    const temporaryPassword = this.passwordService.generateTemporaryPassword();
    const hashedPassword = await this.passwordService.hashPassword(temporaryPassword);
    const expiresAt = this.passwordService.getTempPasswordExpiry();

    await repo.update(employeeId, {
      password: hashedPassword,
      mustChangePassword: true,
      passwordChangedAt: null,
    });

    return { temporaryPassword, expiresAt };
  }

  /**
   * Record successful login
   */
  async recordLogin(employeeId: string, dataSource: DataSource): Promise<void> {
    const repo = dataSource.getRepository(Employee);
    await repo.update(employeeId, {
      lastLoginAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(
    employeeId: string,
    dataSource: DataSource,
    maxAttempts: number = 5,
    lockoutMinutes: number = 15,
  ): Promise<void> {
    const repo = dataSource.getRepository(Employee);
    const employee = await repo.findOne({ where: { id: employeeId } });

    if (!employee) return;

    const newFailedAttempts = employee.failedLoginAttempts + 1;
    const updates: Partial<Employee> = {
      failedLoginAttempts: newFailedAttempts,
    };

    // Lock account if max attempts reached
    if (newFailedAttempts >= maxAttempts) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + lockoutMinutes);
      updates.lockedUntil = lockedUntil;
    }

    await repo.update(employeeId, updates);
  }
}
