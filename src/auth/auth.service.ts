import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'crypto';
import { Role } from '../roles/roles.enum';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OrganizationsService } from '../organizations/organizations.service';
import { OrganizationStatus } from '../organizations/organization-status.enum';
import { UserStatus } from '../users/user-status.enum';
import { AuthTokenPayload } from './auth.types';
import { BootstrapSuperAdminDto } from './dto/bootstrap-super-admin.dto';
import { RefreshSessionService } from './refresh-session.service';
import { OrganizationSubscriptionService } from '../subscriptions/organization-subscription.service';

interface TenantAwareRequest extends Request {
  organization?: { id: string };
  user?: AuthTokenPayload;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly configService: ConfigService,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly subscriptionService: OrganizationSubscriptionService,
  ) {}

  async register(
    dto: RegisterDto,
    req: TenantAwareRequest,
    bootstrapAdminKey?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(
      req,
      dto.organizationId,
    );
    const requestedRole = dto.role ?? Role.EMPLOYEE;
    this.assertRoleAllowed(requestedRole, bootstrapAdminKey);

    const password = this.hashPassword(dto.password);
    const user = await this.usersService.create({
      organizationId,
      email: dto.email,
      password,
      role: requestedRole,
    });

    return this.buildAuthResponse(
      user.id,
      user.organizationId,
      user.email,
      user.role,
    );
  }

  async login(dto: LoginDto, req: TenantAwareRequest) {
    const user = await this.resolveLoginUser(req, dto.email);
    if (!user || !this.verifyPassword(dto.password, user.password)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is inactive');
    }

    if (user.role === Role.ORG_ADMIN && user.organizationId) {
      await this.subscriptionService.assertOrganizationHasValidSubscription(
        user.organizationId,
      );
    }

    return this.buildAuthResponse(
      user.id,
      user.organizationId,
      user.email,
      user.role,
    );
  }

  async bootstrapSuperAdmin(
    dto: BootstrapSuperAdminDto,
    bootstrapAdminKey?: string,
  ) {
    const configuredKey = this.configService.get<string>('BOOTSTRAP_ADMIN_KEY');
    if (!configuredKey || bootstrapAdminKey !== configuredKey) {
      throw new ForbiddenException('Invalid bootstrap key');
    }

    const hasSuperAdmin = await this.usersService.hasAnySuperAdmin();
    if (hasSuperAdmin) {
      throw new ConflictException('SUPER_ADMIN already exists');
    }

    const fallbackName =
      this.configService.get<string>('DEFAULT_ORGANIZATION_NAME') ??
      'Default Organization';
    const fallbackSubdomain =
      this.configService.get<string>('DEFAULT_ORGANIZATION_SUBDOMAIN') ??
      'default';

    const organizationName = dto.organizationName?.trim() || fallbackName;
    const subdomain = dto.subdomain?.trim() || fallbackSubdomain;

    let organization =
      await this.organizationsService.findBySubdomain(subdomain);
    if (!organization) {
      organization = await this.organizationsService.create({
        name: organizationName,
        subdomain,
        status: OrganizationStatus.ACTIVE,
      });
    }

    const user = await this.usersService.create({
      organizationId: organization.id,
      email: dto.email,
      password: this.hashPassword(dto.password),
      role: Role.SUPER_ADMIN,
    });

    return this.buildAuthResponse(
      user.id,
      user.organizationId,
      user.email,
      user.role,
    );
  }

  async ensureDefaultSuperAdmin() {
    const hasSuperAdmin = await this.usersService.hasAnySuperAdmin();
    if (hasSuperAdmin) {
      return false;
    }

    const defaultEmail =
      this.configService.get<string>('DEFAULT_SUPERADMIN_EMAIL') ??
      'ghoulsuper@ghoulhr.com';
    const defaultPassword =
      this.configService.get<string>('DEFAULT_SUPERADMIN_PASSWORD') ??
      'Ghoul@123#';
    const organizationName =
      this.configService.get<string>('DEFAULT_ORGANIZATION_NAME') ??
      'peopleAIQ';
    const subdomain =
      this.configService.get<string>('DEFAULT_ORGANIZATION_SUBDOMAIN') ??
      'ghoulhr';

    let organization =
      await this.organizationsService.findBySubdomain(subdomain);
    if (!organization) {
      organization = await this.organizationsService.create({
        name: organizationName,
        subdomain,
        status: OrganizationStatus.ACTIVE,
      });
    }

    await this.usersService.create({
      organizationId: organization.id,
      email: defaultEmail,
      password: this.hashPassword(defaultPassword),
      role: Role.SUPER_ADMIN,
    });

    this.logger.log(
      `Default SUPER_ADMIN created for organization "${organization.subdomain}"`,
    );
    return true;
  }

  verifyAccessToken(token: string): AuthTokenPayload {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) {
      throw new UnauthorizedException('Malformed token');
    }

    const expectedSig = this.sign(`${header}.${payload}`);
    if (!this.safeEqual(signature, expectedSig)) {
      throw new UnauthorizedException('Invalid token signature');
    }

    let parsedPayload: AuthTokenPayload;
    try {
      parsedPayload = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
    } catch {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (
      !parsedPayload.exp ||
      parsedPayload.exp < Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Token expired');
    }

    if (
      parsedPayload.sessionExp &&
      parsedPayload.sessionExp < Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Session expired');
    }

    return parsedPayload;
  }

  private async buildAuthResponse(
    userId: string,
    organizationId: string,
    email: string,
    role: Role,
  ) {
    const organization =
      await this.organizationsService.findById(organizationId);
    if (!organization) {
      throw new UnauthorizedException(
        'Organization not found for authenticated user',
      );
    }

    const absoluteExpiresAt = this.computeAbsoluteExpiresAt();
    const accessToken = this.mintAccessToken(
      {
        sub: userId,
        organizationId,
        organizationSubdomain: organization.subdomain,
        email,
        role,
      },
      absoluteExpiresAt,
    );

    const refreshExpires = this.capExpiryDate(
      this.getRefreshExpiryDate(),
      absoluteExpiresAt,
    );
    const { plain: refreshPlain, id: refreshSessionId } =
      await this.refreshSessionService.issueMasterSession(
        userId,
        refreshExpires,
        absoluteExpiresAt,
      );

    return {
      accessToken,
      refreshPlain,
      refreshSessionId,
      absoluteExpiresAt,
      user: {
        id: userId,
        organizationId,
        organizationSubdomain: organization.subdomain,
        email,
        role,
      },
    };
  }

  /** Public: mint a short-lived access token (shared with tenant employee auth). */
  mintAccessToken(
    payload: Omit<AuthTokenPayload, 'exp' | 'sessionExp'> &
      Partial<Pick<AuthTokenPayload, 'employeeCode' | 'name'>>,
    absoluteExpiresAt?: Date,
  ): string {
    const sessionDeadline =
      absoluteExpiresAt ?? this.computeAbsoluteExpiresAt();
    const sessionExp = Math.floor(sessionDeadline.getTime() / 1000);
    const accessExp = this.getAccessTokenExpiryEpoch(sessionDeadline);
    const full: AuthTokenPayload = {
      ...payload,
      exp: accessExp,
      sessionExp,
    };
    return this.generateAccessToken(full);
  }

  getSessionMaxLifetimeMs(): number {
    const raw =
      this.configService.get<string>('AUTH_SESSION_MAX_LIFETIME') ?? '24h';
    const sec = this.parseTtlToSeconds(raw) ?? 24 * 60 * 60;
    return sec * 1000;
  }

  computeAbsoluteExpiresAt(): Date {
    return new Date(Date.now() + this.getSessionMaxLifetimeMs());
  }

  capExpiryDate(sliding: Date, absolute: Date): Date {
    return sliding.getTime() <= absolute.getTime() ? sliding : absolute;
  }

  getRefreshTtlMs(): number {
    const raw =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const sec = this.parseTtlToSeconds(raw) ?? 7 * 24 * 60 * 60;
    return sec * 1000;
  }

  getRefreshExpiryDate(): Date {
    return new Date(Date.now() + this.getRefreshTtlMs());
  }

  private async resolveLoginUser(req: TenantAwareRequest, email: string) {
    const tenantOrganizationId = req.organization?.id;

    // First attempt: Search in tenant organization (if available)
    if (tenantOrganizationId) {
      const tenantUser = await this.usersService.findByEmailAndOrganization(
        email,
        tenantOrganizationId,
      );
      if (tenantUser) {
        return tenantUser;
      }
    }

    // Enhanced: If user not found in tenant org, search globally across all organizations
    // This allows SUPER_ADMIN to login from any subdomain
    const candidates = await this.usersService.findByEmail(email);

    if (candidates.length === 0) {
      return null;
    }

    // SUPER_ADMIN Priority: If multiple users found with same email, prioritize SUPER_ADMIN role
    if (candidates.length > 1) {
      const superAdmin = candidates.find((c) => c.role === Role.SUPER_ADMIN);
      if (superAdmin) {
        this.logger.log(
          `Multiple users found for email ${email}, prioritizing SUPER_ADMIN role`,
        );
        return superAdmin;
      }

      // If no SUPER_ADMIN, throw error to prevent ambiguity
      throw new ForbiddenException(
        'Multiple organizations found for this email. Please login from your organization subdomain.',
      );
    }

    // Single candidate found
    return candidates[0];
  }

  private async resolveOrganizationId(
    req: TenantAwareRequest,
    dtoOrganizationId?: string,
  ) {
    const tenantOrganizationId = req.organization?.id;
    if (
      tenantOrganizationId &&
      dtoOrganizationId &&
      tenantOrganizationId !== dtoOrganizationId
    ) {
      throw new ForbiddenException(
        'Cross-tenant organization assignment is not allowed',
      );
    }

    const organizationId = tenantOrganizationId ?? dtoOrganizationId;
    if (!organizationId) {
      throw new BadRequestException(
        'organizationId is required when request host is not tenant-scoped',
      );
    }

    const organization =
      await this.organizationsService.findById(organizationId);
    if (!organization) {
      throw new BadRequestException('Organization does not exist');
    }

    return organizationId;
  }

  private assertRoleAllowed(role: Role, bootstrapAdminKey?: string) {
    if (role !== Role.SUPER_ADMIN) {
      return;
    }

    const configuredKey = this.configService.get<string>('BOOTSTRAP_ADMIN_KEY');
    if (!configuredKey || bootstrapAdminKey !== configuredKey) {
      throw new ForbiddenException('SUPER_ADMIN role assignment is restricted');
    }
  }

  private generateAccessToken(payload: AuthTokenPayload) {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.sign(`${header}.${body}`);
    return `${header}.${body}.${signature}`;
  }

  private sign(value: string) {
    const secret =
      this.configService.get<string>('JWT_SECRET') ??
      this.configService.get<string>('AUTH_TOKEN_SECRET');
    if (!secret) {
      throw new UnauthorizedException(
        'JWT_SECRET (or AUTH_TOKEN_SECRET) is not configured',
      );
    }
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private getAccessTokenExpiryEpoch(absoluteCap?: Date): number {
    const jwtTtl =
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      this.configService.get<string>('JWT_EXPIRES_IN');
    const ttlSeconds = this.parseTtlToSeconds(jwtTtl) ?? 15 * 60;
    const slidingExp = Math.floor(Date.now() / 1000) + ttlSeconds;
    if (!absoluteCap) {
      return slidingExp;
    }
    const absoluteExp = Math.floor(absoluteCap.getTime() / 1000);
    return Math.min(slidingExp, absoluteExp);
  }

  private parseTtlToSeconds(value?: string) {
    if (!value) {
      return null;
    }

    const raw = value.trim();
    if (!raw) {
      return null;
    }

    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }

    const matched = raw.match(/^(\d+)\s*([smhd])$/i);
    if (!matched) {
      return null;
    }

    const amount = Number(matched[1]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const unit = matched[2].toLowerCase();
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return amount * multipliers[unit];
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  private verifyPassword(candidate: string, storedHash: string) {
    const [salt, storedDerived] = storedHash.split(':');
    if (!salt || !storedDerived) {
      return false;
    }

    const derived = scryptSync(candidate, salt, 64).toString('hex');
    return this.safeEqual(derived, storedDerived);
  }

  private safeEqual(a: string, b: string) {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return timingSafeEqual(aBuf, bBuf);
  }
}
