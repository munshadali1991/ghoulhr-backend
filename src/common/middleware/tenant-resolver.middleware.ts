import { Injectable, NestMiddleware, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { OrganizationsService } from '../../organizations/organizations.service';
import { OrganizationStatus } from 'src/organizations/organization-status.enum';
import { TenantConnectionManager } from '../../core/database/tenant-connection.manager';
import { ConfigService } from '@nestjs/config';

export interface TenantRequest extends Request {
  organization?: any;
  tenantDataSource?: DataSource;
  user?: any;
}

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);
  private readonly excludedPaths = [
    '/auth',
    '/api/auth',
    '/api/super-admin',
    '/api-docs',
    '/health',
  ];

  constructor(
    private readonly orgService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
    private readonly configService: ConfigService,
  ) {}

  async use(req: TenantRequest, res: Response, next: NextFunction) {
    const path = req.path;

    // Skip tenant resolution for excluded paths
    if (this.shouldSkipTenantResolution(path)) {
      return next();
    }

    const lockedSubdomain = this.configService.get<string>('TENANT_LOCK_SUBDOMAIN')?.trim();
    if (lockedSubdomain) {
      const lockedOrganization = await this.orgService.findBySubdomain(lockedSubdomain);
      if (!lockedOrganization) {
        throw new NotFoundException(`Locked tenant "${lockedSubdomain}" not found.`);
      }
      await this.attachTenantContext(req, lockedOrganization, `locked:${lockedSubdomain}`);
      return next();
    }

    const host = req.headers.host; // e.g., amazon.ghoulhr.com
    const hostname = this.extractHostname(host);
    const mainDomain = this.extractMainDomain(host);

    // 1. Super admin access on root domain/root port should not be tenant-scoped.
    if (!host || hostname === mainDomain || hostname === 'localhost') {
      return next();
    }

    const port = this.extractPort(host);
    if (port != null) {
      const organizationByPort = await this.orgService.findByOrgPort(port);
      if (organizationByPort) {
        await this.attachTenantContext(req, organizationByPort, `port:${port}`);
        return next();
      }
    }

    // 2. Extract Subdomain
    const subdomain = this.extractSubdomain(host, mainDomain);
    if (!subdomain) {
      return next(); // No subdomain, skip
    }

    const apiSubdomain = (this.configService.get<string>('API_SUBDOMAIN') ?? 'api').trim().toLowerCase();
    if (subdomain.toLowerCase() === apiSubdomain) {
      return next();
    }

    // 3. Fetch Organization from Master DB
    const organization = await this.orgService.findBySubdomain(subdomain);

    // 4. Edge Case: Invalid Subdomain
    if (!organization) {
      throw new NotFoundException(`Tenant "${subdomain}" not found.`);
    }

    await this.attachTenantContext(req, organization, subdomain);
    next();
  }

  private shouldSkipTenantResolution(path: string): boolean {
    return this.excludedPaths.some((excludedPath) => path.startsWith(excludedPath));
  }

  private extractMainDomain(host: string): string {
    // Extract main domain from host (e.g., "ghoulhr.com" from "buggy.ghoulhr.com")
    const hostname = this.extractHostname(host);
    const domainParts = hostname.split('.');
    
    if (domainParts.length >= 2) {
      return domainParts.slice(-2).join('.');
    }
    
    return hostname;
  }

  private extractSubdomain(host: string, mainDomain: string): string | null {
    const hostname = this.extractHostname(host);

    if (hostname === mainDomain) {
      return null;
    }
    
    if (hostname.endsWith(`.${mainDomain}`)) {
      const subdomain = hostname.replace(`.${mainDomain}`, '');
      return subdomain || null;
    }
    
    // Handle localhost subdomains (e.g., buggy.localhost)
    if (hostname.includes('.localhost')) {
      return hostname.split('.')[0];
    }
    
    return null;
  }

  private extractHostname(host: string): string {
    return host.split(':')[0];
  }

  private extractPort(host: string): number | null {
    const parts = host.split(':');
    if (parts.length < 2) {
      return null;
    }

    const maybePort = Number(parts[parts.length - 1]);
    if (!Number.isInteger(maybePort) || maybePort <= 0) {
      return null;
    }

    return maybePort;
  }

  private async attachTenantContext(req: TenantRequest, organization: any, label: string): Promise<void> {
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('This organization account is suspended.');
    }

    try {
      const tenantDataSource = await this.tenantConnectionManager.getOrCreateConnection(organization);
      req.tenantDataSource = tenantDataSource;
      req.organization = organization;
      this.logger.debug(`Tenant resolved: ${label} -> ${organization.dbName}`);
    } catch (error) {
      this.logger.error(`Failed to get tenant connection for ${label}: ${error.message}`);
      throw new NotFoundException(`Tenant database not available for "${label}"`);
    }
  }
}