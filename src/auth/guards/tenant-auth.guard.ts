import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthTokenPayload } from '../auth.types';
import { AuthCookieService } from '../auth-cookie.service';

export interface TenantAuthRequest extends Request {
  organization?: any;
  user?: AuthTokenPayload;
}

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantAuthRequest>();

    const token = this.authCookieService.readAccessToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing authentication');
    }

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
