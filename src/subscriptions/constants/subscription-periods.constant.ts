import { SubscriptionType } from '../subscription-type.enum';

export const SUBSCRIPTION_PERIOD_MONTHS: Record<SubscriptionType, number> = {
  [SubscriptionType.MONTHLY]: 1,
  [SubscriptionType.QUARTERLY]: 3,
  [SubscriptionType.HALF_YEARLY]: 6,
  [SubscriptionType.YEARLY]: 12,
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

/**
 * Monthly plan starting July 1 is valid through August 1 inclusive;
 * blocked from August 2 00:00.
 */
export function computeSubscriptionExpiresAt(
  type: SubscriptionType,
  startsAt: Date,
): Date {
  const months = SUBSCRIPTION_PERIOD_MONTHS[type];
  const periodEnd = startOfDay(addMonths(startOfDay(startsAt), months));
  const expiresAt = new Date(periodEnd);
  expiresAt.setDate(expiresAt.getDate() + 1);
  return expiresAt;
}

export function isSubscriptionDateValid(expiresAt: Date, now = new Date()): boolean {
  return now.getTime() < expiresAt.getTime();
}
