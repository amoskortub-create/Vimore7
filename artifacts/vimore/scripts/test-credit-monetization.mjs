import assert from 'node:assert/strict';
import {
  calculateSplit,
  MIN_WITHDRAW_CREDITS,
  normalizeLegacySubscriptionCredits,
  normalizeLockedCredits,
  normalizeSubscriptionCredits,
  roundCredits,
  WITHDRAW_RATE_LD,
  WITHDRAW_RATE_USD,
} from '../src/lib/credit-monetization.ts';
import { GIFT_ITEMS, validateCreatorEligibility } from '../src/lib/ld-monetization.ts';

assert.equal(validateCreatorEligibility(999, 1000), false);
assert.equal(validateCreatorEligibility(1000, 1000), true);
assert.equal(validateCreatorEligibility(15000, 10000), true);
assert.equal(GIFT_ITEMS.length, 51, 'Expected exactly 51 gift items');
assert.ok(GIFT_ITEMS.every(item => Number.isFinite(item.priceCredits) && item.priceCredits > 0), 'Gift prices must use Credits');
assert.ok(GIFT_ITEMS.some(item => item.priceCredits === 10), 'A 10-Credit Gift must be available');
assert.deepEqual(calculateSplit(10), { creatorEarningsCredits: 8.1, platformFeeCredits: 1.9 });
assert.equal(normalizeLockedCredits(235), 5, 'Legacy LD locked content must display in Credits');
assert.equal(normalizeSubscriptionCredits(20), 20, 'Explicit subscription prices are Credits');
assert.equal(normalizeLegacySubscriptionCredits(940), 20, 'Legacy LD subscriptions must display in Credits');
assert.equal(MIN_WITHDRAW_CREDITS, 10);
assert.equal(roundCredits(100 - 20), 80);
assert.equal(roundCredits(20 * WITHDRAW_RATE_LD), 940);
assert.equal(roundCredits(20 * WITHDRAW_RATE_USD), 5);
console.log('Credits monetization checks passed');
