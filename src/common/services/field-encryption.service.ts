import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * AES-256-GCM for sensitive HR fields at rest (PAN, Aadhaar, bank account, document payloads).
 * Key is derived from FIELD_ENCRYPTION_KEY (hex 64 chars) or SHA-256 of JWT_SECRET.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly logger = new Logger(FieldEncryptionService.name);
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const hex = this.configService.get<string>('FIELD_ENCRYPTION_KEY')?.trim();
    if (hex && hex.length === 64) {
      this.key = Buffer.from(hex, 'hex');
    } else {
      const fallback = this.configService.get<string>('JWT_SECRET') || 'dev-only-key-change-me';
      this.key = createHash('sha256').update(fallback).digest();
      this.logger.warn(
        'FIELD_ENCRYPTION_KEY not set (64 hex chars). Deriving key from JWT_SECRET — set FIELD_ENCRYPTION_KEY in production.',
      );
    }
  }

  encrypt(plain: string | null | undefined): string | null {
    if (plain == null || plain === '') return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string | null | undefined): string | null {
    if (payload == null || payload === '') return null;
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  }

  lastFour(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\s/g, '');
    if (digits.length < 4) return digits;
    return digits.slice(-4);
  }
}
