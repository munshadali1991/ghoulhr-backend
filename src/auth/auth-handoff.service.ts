import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { AuthHandoffToken } from './entities/auth-handoff-token.entity';
import { RefreshSessionService } from './refresh-session.service';
import { AuthRefreshService } from './auth-refresh.service';
import {
  resolveSubdomainFromHost,
  shouldIssueHandoff,
} from './utils/auth-host.util';
import { Role } from '../roles/roles.enum';

@Injectable()
export class AuthHandoffService {
  constructor(
    @InjectRepository(AuthHandoffToken)
    private readonly handoffRepo: Repository<AuthHandoffToken>,
    private readonly refreshSessionService: RefreshSessionService,
    private readonly authRefreshService: AuthRefreshService,
    private readonly configService: ConfigService,
  ) {}

  private hashCode(plain: string): string {
    return createHash('sha256').update(plain, 'utf8').digest('hex');
  }

  private getTtlMs(): number {
    const raw = this.configService.get<string>('AUTH_HANDOFF_TTL_SECONDS');
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    return 60_000;
  }

  private getAppDomain(): string {
    return this.configService.get<string>('APP_DOMAIN') ?? '';
  }

  shouldIssueForLogin(
    host: string | undefined,
    organizationSubdomain: string | undefined,
    role: string,
  ): boolean {
    if (role === Role.SUPER_ADMIN || !organizationSubdomain) {
      return false;
    }
    return shouldIssueHandoff(host, organizationSubdomain, this.getAppDomain());
  }

  async issue(
    refreshSessionId: string,
    targetSubdomain: string,
  ): Promise<{ code: string }> {
    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.getTtlMs());
    await this.handoffRepo.save(
      this.handoffRepo.create({
        tokenHash: this.hashCode(code),
        refreshSessionId,
        targetSubdomain,
        expiresAt,
        consumedAt: null,
      }),
    );
    return { code };
  }

  async consume(
    code: string,
    requestHost: string | undefined,
  ): Promise<{ accessToken: string; refreshPlain: string }> {
    const tokenHash = this.hashCode(code);
    const row = await this.handoffRepo.findOne({ where: { tokenHash } });
    if (!row) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }
    if (row.consumedAt) {
      throw new UnauthorizedException('Handoff code already used');
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Handoff code expired');
    }

    const requestSubdomain = resolveSubdomainFromHost(
      requestHost,
      this.getAppDomain(),
    );
    if (!requestSubdomain || requestSubdomain !== row.targetSubdomain) {
      throw new ForbiddenException(
        'Handoff code is not valid for this organization host',
      );
    }

    const session = await this.refreshSessionService.findById(
      row.refreshSessionId,
    );
    if (!session) {
      throw new UnauthorizedException('Invalid or expired handoff code');
    }

    const updated = await this.handoffRepo.update(
      { id: row.id, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
    if (!updated.affected) {
      throw new UnauthorizedException('Handoff code already used');
    }

    return this.authRefreshService.mintAndRotateFromSession(session);
  }
}
