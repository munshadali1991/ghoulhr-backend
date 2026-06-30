import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthCookieService } from '../auth-cookie.service';

const ALLOWED_PATHS = new Set([
  '/auth/change-password',
  '/auth/session',
  '/auth/refresh',
  '/auth/logout',
]);

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    if (ALLOWED_PATHS.has(path)) {
      return true;
    }

    const token = this.authCookieService.readAccessToken(request);
    if (!token) {
      return true;
    }

    let payload;
    try {
      payload = this.authService.verifyAccessToken(token);
    } catch {
      return true;
    }

    if (!payload.mustChangePassword) {
      return true;
    }

    if (!payload.employeeCode) {
      return true;
    }

    throw new ForbiddenException({
      message: 'Password change required before accessing the portal',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
}
