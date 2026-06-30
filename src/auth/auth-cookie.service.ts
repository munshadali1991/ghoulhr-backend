import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  getAccessCookieName(): string {
    return (
      this.configService.get<string>('AUTH_ACCESS_COOKIE_NAME') ??
      'ghoulhr_access'
    );
  }

  getRefreshCookieName(): string {
    return (
      this.configService.get<string>('AUTH_REFRESH_COOKIE_NAME') ??
      'ghoulhr_refresh'
    );
  }

  /** Prefer HttpOnly access cookie; fall back to Authorization for tooling. */
  readAccessToken(req: Request): string | null {
    const fromCookie = req.cookies?.[this.getAccessCookieName()];
    if (typeof fromCookie === 'string' && fromCookie.length > 0) {
      return fromCookie;
    }
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length);
    }
    return null;
  }

  private isSecure(): boolean {
    if (this.configService.get<string>('COOKIE_SECURE') === 'true') {
      return true;
    }
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private sameSite(): 'lax' | 'strict' | 'none' {
    const raw = (
      this.configService.get<string>('COOKIE_SAMESITE') ?? 'lax'
    ).toLowerCase();
    if (raw === 'strict' || raw === 'none') {
      return raw;
    }
    return 'lax';
  }

  /**
   * Host-only cookies (no Domain): scoped to the API host (e.g. api.example.com).
   */
  attachAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    sessionExpiresAt?: Date,
  ): void {
    const secure = this.isSecure();
    const sameSite = this.sameSite();
    const common = {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
    } as const;

    const sessionRemainingMs = sessionExpiresAt
      ? Math.max(0, sessionExpiresAt.getTime() - Date.now())
      : undefined;

    res.cookie(this.getAccessCookieName(), accessToken, {
      ...common,
      maxAge: this.capMaxAge(this.accessCookieMaxAgeMs(), sessionRemainingMs),
    });
    res.cookie(this.getRefreshCookieName(), refreshToken, {
      ...common,
      maxAge: this.capMaxAge(this.refreshCookieMaxAgeMs(), sessionRemainingMs),
    });
  }

  clearAuthCookies(res: Response): void {
    const secure = this.isSecure();
    const sameSite = this.sameSite();
    const opts = { httpOnly: true, secure, sameSite, path: '/' } as const;
    res.clearCookie(this.getAccessCookieName(), opts);
    res.clearCookie(this.getRefreshCookieName(), opts);
  }

  private capMaxAge(configuredMs: number, sessionRemainingMs?: number): number {
    if (sessionRemainingMs === undefined) {
      return configuredMs;
    }
    return Math.min(configuredMs, sessionRemainingMs);
  }

  private accessCookieMaxAgeMs(): number {
    return this.parseDurationToMs(
      this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
      15 * 60 * 1000,
    );
  }

  private refreshCookieMaxAgeMs(): number {
    return this.parseDurationToMs(
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      7 * 24 * 60 * 60 * 1000,
    );
  }

  private parseDurationToMs(
    value: string | undefined,
    fallbackMs: number,
  ): number {
    if (!value?.trim()) {
      return fallbackMs;
    }
    const raw = value.trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric * 1000;
    }
    const matched = raw.match(/^(\d+)\s*([smhd])$/i);
    if (!matched) {
      return fallbackMs;
    }
    const amount = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    const mult: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * (mult[unit] ?? 1000);
  }
}
