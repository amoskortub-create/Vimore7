export const CREATOR_EARNINGS_RATE = 0.8101;
export const WITHDRAW_RATE_LD = 47;
export const WITHDRAW_RATE_USD = 0.25;
export const MIN_WITHDRAW_CREDITS = 10;

export function roundCredits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSplit(credits: number): {
  creatorEarningsCredits: number;
  platformFeeCredits: number;
} {
  const amount = Number(credits);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Credits must be a positive number.');
  }
  const creatorEarningsCredits = roundCredits(amount * CREATOR_EARNINGS_RATE);
  return {
    creatorEarningsCredits,
    platformFeeCredits: roundCredits(amount - creatorEarningsCredits),
  };
}

export function normalizeLockedCredits(value: unknown): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 2;
  if (price >= 2 && price <= 10) return Math.round(price);
  return Math.min(10, Math.max(2, Math.round(price / WITHDRAW_RATE_LD)));
}

export function normalizeSubscriptionCredits(value: unknown): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 5;
  return roundCredits(price);
}

export function normalizeLegacySubscriptionCredits(value: unknown): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return 5;
  return roundCredits(price > 10 ? price / WITHDRAW_RATE_LD : price);
}
