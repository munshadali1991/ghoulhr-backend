import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { AuthTokenPayload } from '../../auth/auth.types';

export interface TenantAuthRequest extends Request {
  organization?: any;
  user?: AuthTokenPayload;
}

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantAuthRequest>();
    
    // Get authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    // Extract token
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    // Verify token
    const user = this.authService.verifyAccessToken(token);
    
    // Attach user to request
    request.user = user;

    // If tenant resolution middleware has run, validate subdomain match
    if (request.organization) {
      const requestSubdomain = request.organization.subdomain;
      const tokenSubdomain = user.organizationSubdomain;

      if (requestSubdomain !== tokenSubdomain) {
        throw new ForbiddenException(
          'Access denied: Token does not match the current tenant',
        );
      }
    }

    return true;
  }
}
