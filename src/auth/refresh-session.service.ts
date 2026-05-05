import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { RefreshSession, RefreshSessionKind } from './entities/refresh-session.entity';

@Injectable()
export class RefreshSessionService {
  constructor(
    @InjectRepository(RefreshSession)
    private readonly refreshRepo: Repository<RefreshSession>,
  ) {}

  private hashToken(plain: string): string {
    return createHash('sha256').update(plain, 'utf8').digest('hex');
  }

  private newRefreshPlain(): string {
    return randomBytes(48).toString('base64url');
  }

  async issueMasterSession(masterUserId: string, expiresAt: Date): Promise<{ plain: string }> {
    const plain = this.newRefreshPlain();
    await this.refreshRepo.save(
      this.refreshRepo.create({
        tokenHash: this.hashToken(plain),
        sessionKind: 'master',
        masterUserId,
        employeeId: null,
        organizationId: null,
        expiresAt,
        revokedAt: null,
        replacedBySessionId: null,
      }),
    );
    return { plain };
  }

  async issueEmployeeSession(
    employeeId: string,
    organizationId: string,
    expiresAt: Date,
  ): Promise<{ plain: string }> {
    const plain = this.newRefreshPlain();
    await this.refreshRepo.save(
      this.refreshRepo.create({
        tokenHash: this.hashToken(plain),
        sessionKind: 'employee',
        masterUserId: null,
        employeeId,
        organizationId,
        expiresAt,
        revokedAt: null,
        replacedBySessionId: null,
      }),
    );
    return { plain };
  }

  async findValidByPlain(plain: string): Promise<RefreshSession | null> {
    const tokenHash = this.hashToken(plain);
    const row = await this.refreshRepo.findOne({ where: { tokenHash } });
    if (!row || row.revokedAt) {
      return null;
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return row;
  }

  async revokeSession(id: string): Promise<void> {
    await this.refreshRepo.update({ id }, { revokedAt: new Date() });
  }

  async rotateSession(
    previous: RefreshSession,
    newExpiresAt: Date,
  ): Promise<{ plain: string; newSession: RefreshSession }> {
    const plain = this.newRefreshPlain();
    const newSession = await this.refreshRepo.save(
      this.refreshRepo.create({
        tokenHash: this.hashToken(plain),
        sessionKind: previous.sessionKind,
        masterUserId: previous.masterUserId,
        employeeId: previous.employeeId,
        organizationId: previous.organizationId,
        expiresAt: newExpiresAt,
        revokedAt: null,
        replacedBySessionId: null,
      }),
    );
    await this.refreshRepo.update(
      { id: previous.id },
      { revokedAt: new Date(), replacedBySessionId: newSession.id },
    );
    return { plain, newSession };
  }

  async revokeByRefreshPlain(plain: string): Promise<void> {
    const tokenHash = this.hashToken(plain);
    await this.refreshRepo.update({ tokenHash }, { revokedAt: new Date() });
  }
}
