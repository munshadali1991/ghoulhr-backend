import { Injectable, BadRequestException } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

@Injectable()
export class PasswordService {
  private readonly saltLength = 16;
  private readonly keyLength = 64;
  private readonly tempPasswordLength = 16;
  private readonly tempPasswordExpiryDays = 7;

  /**
   * Hash a password using scrypt with random salt
   */
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(this.saltLength).toString('hex');
    const derivedKey = (await scryptAsync(password, salt, this.keyLength)) as Buffer;
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Verify a password against a stored hash
   */
  async verifyPassword(candidate: string, storedHash: string): Promise<boolean> {
    try {
      const [salt, storedDerivedKey] = storedHash.split(':');
      if (!salt || !storedDerivedKey) {
        return false;
      }

      const derivedKey = (await scryptAsync(candidate, salt, this.keyLength)) as Buffer;
      const derivedKeyHex = derivedKey.toString('hex');

      // Timing-safe comparison to prevent timing attacks
      return timingSafeEqual(
        Buffer.from(derivedKeyHex),
        Buffer.from(storedDerivedKey),
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate a cryptographically secure temporary password
   * Format: 4 uppercase + 4 lowercase + 4 digits + 4 special chars
   */
  generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$%^&*';

    const getRandomChar = (charset: string): string => {
      const randomBytes = new Uint8Array(1);
      crypto.getRandomValues(randomBytes);
      return charset[randomBytes[0] % charset.length];
    };

    // Generate guaranteed characters from each set
    let password = '';
    for (let i = 0; i < 4; i++) {
      password += getRandomChar(uppercase);
      password += getRandomChar(lowercase);
      password += getRandomChar(digits);
      password += getRandomChar(special);
    }

    // Shuffle the password to avoid predictable pattern
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  /**
   * Get temporary password expiry date
   */
  getTempPasswordExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + this.tempPasswordExpiryDays);
    return expiry;
  }

  /**
   * Check if temporary password has expired
   */
  isTempPasswordExpired(passwordChangedAt: Date | null): boolean {
    if (!passwordChangedAt) {
      return true; // Never changed = expired
    }

    const expiryDate = new Date(passwordChangedAt);
    expiryDate.setDate(expiryDate.getDate() + this.tempPasswordExpiryDays);

    return new Date() > expiryDate;
  }

  /**
   * Validate password strength for new passwords
   */
  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[@$!%*?&#]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&#)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
