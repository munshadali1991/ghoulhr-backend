import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { AuthCookieService } from '../auth-cookie.service';

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.authCookieService.readAccessToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing authentication');
    }

    (req as any).user = this.authService.verifyAccessToken(token);
    return true;
  }
}
