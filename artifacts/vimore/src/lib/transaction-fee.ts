export const PLATFORM_FEE_RATE = 0.2;
export const CREATOR_SHARE_RATE = 0.8;
export const CREDIT_USD_RATE = 0.01;

export function roundCredits(value: number): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function calculatePlatformFee(amount: number): number {
  const n = roundCredits(amount);
  if (n <= 0) return 0;
  return roundCredits(n * PLATFORM_FEE_RATE);
}

export function calculateCreatorShare(amount: number): number {
  const n = roundCredits(amount);
  if (n <= 0) return 0;
  return roundCredits(n - calculatePlatformFee(n));
}
