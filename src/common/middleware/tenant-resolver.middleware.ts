import { Injectable, NestMiddleware, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { OrganizationsService } from '../../organizations/organizations.service';
import { OrganizationStatus } from 'src/organizations/organization-status.enum';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  constructor(private readonly orgService: OrganizationsService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const host = req.headers.host; // e.g., amazon.ghoulhr.com
    const mainDomain = 'ghoulhr.com';

    // 1. Handle Root Domain Access (Edge Case)
    if (!host || host === mainDomain || host === 'localhost:3000') {
      return next(); // Allow access to the main landing page/API
    }

    // 2. Extract Subdomain
    const subdomain = host.split('.')[0];

    // 3. Fetch Organization
    const organization = await this.orgService.findBySubdomain(subdomain);

    // 4. Edge Case: Invalid Subdomain
    if (!organization) {
      throw new NotFoundException(`Tenant "${subdomain}" not found.`);
    }

    // 5. Edge Case: Inactive Organization
    if (organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException('This organization account is suspended.');
    }

    // 6. Attach to Request
    (req as any).organization = organization;
    
    next();
  }
}