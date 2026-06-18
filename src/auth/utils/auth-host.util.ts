export function extractHostname(host: string | undefined): string {
  if (!host) {
    return '';
  }
  return host.split(':')[0].toLowerCase();
}

/**
 * Resolve tenant subdomain from a request Host header.
 * Returns null for apex hosts (localhost, 127.0.0.1, APP_DOMAIN).
 */
export function resolveSubdomainFromHost(
  host: string | undefined,
  appDomain?: string,
): string | null {
  const hostname = extractHostname(host);
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  const apex = (appDomain ?? '').trim().toLowerCase();
  if (apex && hostname === apex) {
    return null;
  }

  if (hostname.includes('.localhost')) {
    const subdomain = hostname.split('.')[0];
    return subdomain || null;
  }

  if (apex && hostname.endsWith(`.${apex}`)) {
    const subdomain = hostname.slice(0, -(apex.length + 1));
    return subdomain || null;
  }

  const parts = hostname.split('.');
  if (parts.length > 2) {
    return parts[0] || null;
  }

  return null;
}

export function shouldIssueHandoff(
  host: string | undefined,
  organizationSubdomain: string,
  appDomain?: string,
): boolean {
  const requestSubdomain = resolveSubdomainFromHost(host, appDomain);
  return requestSubdomain !== organizationSubdomain;
}
