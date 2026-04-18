import { Injectable, NestMiddleware, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { OrganizationsService } from '../../organizations/organizations.service';
import { OrganizationStatus } from 'src/organizations/organization-status.enum';
import { TenantConnectionManager } from '../../core/database/tenant-connection.manager';

export interface TenantRequest extends Request {
  organization?: any;
  tenantDataSource?: DataSource;
  user?: any;
}

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);
  private readonly excludedPaths = [
    '/api/auth',
    '/api/super-admin',
    '/api-docs',
    '/health',
  ];

  constructor(
    private readonly orgService: OrganizationsService,
    private readonly tenantConnectionManager: TenantConnectionManager,
  ) {}

  async use(req: TenantRequest, res: Response, next: NextFunction) {
    const path = req.path;

    // Skip tenant resolution for excluded paths
    if (this.shouldSkipTenantResolution(path)) {
      return next();
    }

    const host = req.headers.host; // e.g., amazon.ghoulhr.com
    const mainDomain = this.extractMainDomain(host);

    // 1. Handle Root Domain Access (Edge Case)
    if (!host || host === mainDomain || host === 'localhost:3000' || host === 'localhost') {
      return next(); // Allow access to the main landing page/API
    }

    // 2. Extract Subdomain
    const subdomain = this.extractSubdomain(host, mainDomain);
    if (!subdomain) {
      return next(); // No subdomain, skip
    }

    // 3. Fetch Organization from Master DB
    const organization = await this.orgService.findBySubdomain(subdomain);

    // 4. Edge Case: Invalid Subdomain
    if (!organization) {
      throw new NotFoundException(`Tenant "${subdomain}" not found.`);
    }

    // 5. Edge Case: Inactive Organization
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('This organization account is suspended.');
    }

    // 6. Get Tenant DataSource
    try {
      const tenantDataSource = await this.tenantConnectionManager.getOrCreateConnection(organization);
      req.tenantDataSource = tenantDataSource;
    } catch (error) {
      this.logger.error(`Failed to get tenant connection for ${subdomain}: ${error.message}`);
      throw new NotFoundException(`Tenant database not available for "${subdomain}"`);
    }

    // 7. Attach to Request
    req.organization = organization;

    this.logger.debug(`Tenant resolved: ${subdomain} -> ${organization.dbName}`);
    
    next();
  }

  private shouldSkipTenantResolution(path: string): boolean {
    return this.excludedPaths.some((excludedPath) => path.startsWith(excludedPath));
  }

  private extractMainDomain(host: string): string {
    // Extract main domain from host (e.g., "ghoulhr.com" from "buggy.ghoulhr.com")
    const parts = host.split(':');
    const hostname = parts[0];
    const domainParts = hostname.split('.');
    
    if (domainParts.length >= 2) {
      return domainParts.slice(-2).join('.');
    }
    
    return hostname;
  }

  private extractSubdomain(host: string, mainDomain: string): string | null {
    const parts = host.split(':');
    const hostname = parts[0];
    
    if (hostname.endsWith(mainDomain)) {
      const subdomain = hostname.replace(`.${mainDomain}`, '');
      return subdomain || null;
    }
    
    // Handle localhost subdomains (e.g., buggy.localhost)
    if (hostname.includes('.localhost')) {
      return hostname.split('.')[0];
    }
    
    return null;
  }
}