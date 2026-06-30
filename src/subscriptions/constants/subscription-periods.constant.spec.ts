import {
  computeSubscriptionExpiresAt,
  isSubscriptionDateValid,
} from './subscription-periods.constant';
import { SubscriptionType } from '../subscription-type.enum';

describe('subscription-periods.constant', () => {
  describe('computeSubscriptionExpiresAt', () => {
    it('monthly plan starting July 1 expires at August 2 00:00', () => {
      const startsAt = new Date(2026, 6, 1);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.MONTHLY,
        startsAt,
      );

      expect(expiresAt.getFullYear()).toBe(2026);
      expect(expiresAt.getMonth()).toBe(7);
      expect(expiresAt.getDate()).toBe(2);
      expect(expiresAt.getHours()).toBe(0);
    });

    it('is valid through August 1 inclusive and blocked from August 2', () => {
      const startsAt = new Date(2026, 6, 1);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.MONTHLY,
        startsAt,
      );

      const aug1End = new Date(2026, 7, 1, 23, 59, 59, 999);
      const aug2Start = new Date(2026, 7, 2, 0, 0, 0, 0);

      expect(isSubscriptionDateValid(expiresAt, aug1End)).toBe(true);
      expect(isSubscriptionDateValid(expiresAt, aug2Start)).toBe(false);
    });

    it('quarterly plan adds three months plus grace day', () => {
      const startsAt = new Date(2026, 0, 1);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.QUARTERLY,
        startsAt,
      );

      expect(expiresAt.getFullYear()).toBe(2026);
      expect(expiresAt.getMonth()).toBe(3);
      expect(expiresAt.getDate()).toBe(2);
    });

    it('half-yearly plan adds six months plus grace day', () => {
      const startsAt = new Date(2026, 0, 15);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.HALF_YEARLY,
        startsAt,
      );

      expect(expiresAt.getFullYear()).toBe(2026);
      expect(expiresAt.getMonth()).toBe(6);
      expect(expiresAt.getDate()).toBe(16);
    });

    it('yearly plan adds twelve months plus grace day', () => {
      const startsAt = new Date(2026, 0, 1);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.YEARLY,
        startsAt,
      );

      expect(expiresAt.getFullYear()).toBe(2027);
      expect(expiresAt.getMonth()).toBe(0);
      expect(expiresAt.getDate()).toBe(2);
    });

    it('handles month-end starts (Jan 31 + 1 month)', () => {
      const startsAt = new Date(2026, 0, 31);
      const expiresAt = computeSubscriptionExpiresAt(
        SubscriptionType.MONTHLY,
        startsAt,
      );

      expect(expiresAt.getFullYear()).toBe(2026);
      expect(expiresAt.getMonth()).toBe(2);
      expect(expiresAt.getDate()).toBe(1);
    });
  });
});
