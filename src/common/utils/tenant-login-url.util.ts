import { ConfigService } from '@nestjs/config';

const IPV4_PATTERN =
  /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Public base domain used in tenant login URLs (e.g. peopleaiq.com).
 * Prefers APP_PUBLIC_DOMAIN / SSL_AUTO_BASE_DOMAIN over APP_DOMAIN, and
 * rejects bare IPs so URLs never become https://tenant.3.26.99.219/login.
 */
export function resolvePublicAppDomain(
  configService: ConfigService,
): string {
  const candidates = [
    configService.get<string>('APP_PUBLIC_DOMAIN'),
    configService.get<string>('SSL_AUTO_BASE_DOMAIN'),
    configService.get<string>('APP_DOMAIN'),
    'peopleaiq.com',
  ];

  for (const raw of candidates) {
    const value = raw?.trim().toLowerCase();
    if (!value) continue;
    if (IPV4_PATTERN.test(value)) continue;
    if (value === 'localhost' || value === '127.0.0.1') continue;
    return value;
  }

  return 'peopleaiq.com';
}

export function buildTenantLoginUrl(
  configService: ConfigService,
  subdomain: string,
): string {
  const appDomain = resolvePublicAppDomain(configService);
  const host = subdomain?.trim()
    ? `${subdomain.trim().toLowerCase()}.${appDomain}`
    : appDomain;
  return `https://${host}/login`;
}
