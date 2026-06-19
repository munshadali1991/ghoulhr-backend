import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

@Injectable()
export class TenantSslProvisioningService {
  private readonly logger = new Logger(TenantSslProvisioningService.name);
  private readonly subdomainRegex = /^[a-z0-9-]+$/;

  constructor(private readonly configService: ConfigService) {}

  async provisionForSubdomain(subdomain: string): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    const normalizedSubdomain = subdomain.trim().toLowerCase();
    if (!this.subdomainRegex.test(normalizedSubdomain)) {
      this.logger.warn(
        `Skipping SSL auto-provisioning for invalid subdomain "${subdomain}"`,
      );
      return;
    }

    const baseDomain = (
      this.configService.get<string>('SSL_AUTO_BASE_DOMAIN') ?? ''
    )
      .trim()
      .toLowerCase();
    if (!baseDomain) {
      this.logger.warn(
        'SSL auto-provisioning is enabled but SSL_AUTO_BASE_DOMAIN is not set',
      );
      return;
    }

    const fqdn = `${normalizedSubdomain}.${baseDomain}`;
    const timeoutMs = this.getTimeoutMs();
    const commandTemplate = (
      this.configService.get<string>('SSL_AUTO_PROVISION_COMMAND') ?? ''
    ).trim();
    const scriptPath = (
      this.configService.get<string>('SSL_AUTO_PROVISION_SCRIPT') ??
      '/usr/local/bin/provision-tenant-ssl.sh'
    ).trim();

    this.logger.log(`Starting SSL auto-provisioning for ${fqdn}`);

    try {
      if (commandTemplate) {
        const command = commandTemplate.replaceAll('{fqdn}', fqdn);
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
        });
        this.logCommandOutput(fqdn, stdout, stderr);
      } else {
        const { stdout, stderr } = await execFileAsync(scriptPath, [fqdn], {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
        });
        this.logCommandOutput(fqdn, stdout, stderr);
      }

      this.logger.log(`SSL auto-provisioning completed for ${fqdn}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'unknown runtime error';
      this.logger.error(`SSL auto-provisioning failed for ${fqdn}: ${message}`);
    }
  }

  private isEnabled(): boolean {
    const raw = (
      this.configService.get<string>('SSL_AUTO_PROVISION_ENABLED') ?? 'false'
    )
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  private getTimeoutMs(): number {
    const raw = Number(
      this.configService.get<string>('SSL_AUTO_PROVISION_TIMEOUT_MS'),
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 180_000;
  }

  private logCommandOutput(fqdn: string, stdout: string, stderr: string) {
    if (stdout.trim()) {
      this.logger.log(
        `SSL auto-provisioning stdout for ${fqdn}: ${stdout.trim()}`,
      );
    }
    if (stderr.trim()) {
      this.logger.warn(
        `SSL auto-provisioning stderr for ${fqdn}: ${stderr.trim()}`,
      );
    }
  }
}
