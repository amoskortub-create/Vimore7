/**
 * Prices and limits for credit-based creator monetization and promotion features.
 *
 * Keep these values shared between the UI and server handlers so the amount
 * shown to users is always the amount charged.
 */
export const CREDIT_PRICES = {
  verification: 500,
  postBoostPerDay: 50,
  musicBoostPerDay: 50,
  marketplaceBoostPerDay: 50,
  storeBoostPerDay: 50,
  adPerDay: 75,
} as const;

export const CREDIT_LIMITS = {
  giftMin: 2,
  giftMax: 500,
  lockPostMin: 20,
  lockPostMax: 100,
  subscriptionMonthly: 500,
  creditUsdRate: 0.01,
} as const;