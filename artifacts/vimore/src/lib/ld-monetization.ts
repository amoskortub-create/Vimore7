export const GIFT_CATEGORIES = [
  { id: 'love', label: 'Love', emoji: '💞' },
  { id: 'nature', label: 'Nature', emoji: '🌿' },
  { id: 'food', label: 'Food', emoji: '🍽️' },
  { id: 'celebration', label: 'Celebration', emoji: '🎉' },
  { id: 'support', label: 'Support', emoji: '🤝' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'achievement', label: 'Achievement', emoji: '🏆' },
  { id: 'community', label: 'Community', emoji: '🌍' },
  { id: 'wellness', label: 'Wellness', emoji: '✨' },
] as const;

export const GIFT_ITEMS = [
  { id: 'gift-01', name: 'Blush Bloom', emoji: '🌷', priceCredits: 2, category: 'love' },
  { id: 'gift-02', name: 'Sweet Heart', emoji: '💗', priceCredits: 10, category: 'love' },
  { id: 'gift-03', name: 'Rose Aura', emoji: '🌹', priceCredits: 25, category: 'love' },
  { id: 'gift-04', name: 'Love Letter', emoji: '💌', priceCredits: 60, category: 'love' },
  { id: 'gift-05', name: 'Cupid Crown', emoji: '👑', priceCredits: 120, category: 'love' },
  { id: 'gift-06', name: 'Hope Basket', emoji: '🧺', priceCredits: 5, category: 'support' },
  { id: 'gift-07', name: 'Kindness Pack', emoji: '🤝', priceCredits: 20, category: 'support' },
  { id: 'gift-08', name: 'Village Blessing', emoji: '🙏', priceCredits: 50, category: 'support' },
  { id: 'gift-09', name: 'Power Boost', emoji: '⚡', priceCredits: 100, category: 'support' },
  { id: 'gift-10', name: 'Helping Hand', emoji: '🫶', priceCredits: 200, category: 'support' },
  { id: 'gift-11', name: 'Sunrise Petal', emoji: '🌼', priceCredits: 2, category: 'nature' },
  { id: 'gift-12', name: 'Forest Calm', emoji: '🌿', priceCredits: 12, category: 'nature' },
  { id: 'gift-13', name: 'Leaf Blessing', emoji: '🍃', priceCredits: 35, category: 'nature' },
  { id: 'gift-14', name: 'Rainforest Glow', emoji: '🌴', priceCredits: 85, category: 'nature' },
  { id: 'gift-15', name: 'Golden Horizon', emoji: '🌅', priceCredits: 180, category: 'nature' },
  { id: 'gift-16', name: 'Market Feast', emoji: '🍲', priceCredits: 4, category: 'food' },
  { id: 'gift-17', name: 'Palm Rice', emoji: '🍚', priceCredits: 15, category: 'food' },
  { id: 'gift-18', name: 'Jolly Cake', emoji: '🎂', priceCredits: 45, category: 'food' },
  { id: 'gift-19', name: 'Cocoa Joy', emoji: '🍫', priceCredits: 110, category: 'food' },
  { id: 'gift-20', name: 'Feast Table', emoji: '🍽️', priceCredits: 250, category: 'food' },
  { id: 'gift-21', name: 'Party Pop', emoji: '🎉', priceCredits: 8, category: 'celebration' },
  { id: 'gift-22', name: 'Confetti Burst', emoji: '🎊', priceCredits: 30, category: 'celebration' },
  { id: 'gift-23', name: 'Birthday Star', emoji: '⭐', priceCredits: 75, category: 'celebration' },
  { id: 'gift-24', name: 'Victory Bell', emoji: '🔔', priceCredits: 160, category: 'celebration' },
  { id: 'gift-25', name: 'Grand Finale', emoji: '🏆', priceCredits: 350, category: 'celebration' },
  { id: 'gift-26', name: 'Street Beat', emoji: '🎵', priceCredits: 5, category: 'music' },
  { id: 'gift-27', name: 'Studio Spark', emoji: '🎧', priceCredits: 25, category: 'music' },
  { id: 'gift-28', name: 'Vibe Mix', emoji: '🎶', priceCredits: 70, category: 'music' },
  { id: 'gift-29', name: 'Sound Wave', emoji: '🔊', priceCredits: 150, category: 'music' },
  { id: 'gift-30', name: 'Live Stage', emoji: '🎤', priceCredits: 300, category: 'music' },
  { id: 'gift-31', name: 'Travel Bag', emoji: '🧳', priceCredits: 10, category: 'travel' },
  { id: 'gift-32', name: 'Airport Pass', emoji: '🎫', priceCredits: 40, category: 'travel' },
  { id: 'gift-33', name: 'Coastline Escape', emoji: '🏖️', priceCredits: 100, category: 'travel' },
  { id: 'gift-34', name: 'Sky Route', emoji: '✈️', priceCredits: 220, category: 'travel' },
  { id: 'gift-35', name: 'Global Glow', emoji: '🌍', priceCredits: 400, category: 'travel' },
  { id: 'gift-36', name: 'First Win', emoji: '🥇', priceCredits: 15, category: 'achievement' },
  { id: 'gift-37', name: 'Momentum Star', emoji: '🌟', priceCredits: 55, category: 'achievement' },
  { id: 'gift-38', name: 'Silver Goal', emoji: '🥈', priceCredits: 140, category: 'achievement' },
  { id: 'gift-39', name: 'Champion Crown', emoji: '🏆', priceCredits: 280, category: 'achievement' },
  { id: 'gift-40', name: 'Legend Medal', emoji: '🏅', priceCredits: 450, category: 'achievement' },
  { id: 'gift-41', name: 'Hometown Pride', emoji: '🏡', priceCredits: 6, category: 'community' },
  { id: 'gift-42', name: 'Community Cheer', emoji: '👏', priceCredits: 28, category: 'community' },
  { id: 'gift-43', name: 'Neighborhood Lift', emoji: '🧡', priceCredits: 80, category: 'community' },
  { id: 'gift-44', name: 'Unity Circle', emoji: '🤝', priceCredits: 190, category: 'community' },
  { id: 'gift-45', name: 'Together Crown', emoji: '👨‍👩‍👧‍👦', priceCredits: 380, category: 'community' },
  { id: 'gift-46', name: 'Peace Euphoria', emoji: '🕊️', priceCredits: 10, category: 'wellness' },
  { id: 'gift-47', name: 'Calm Wave', emoji: '🌊', priceCredits: 50, category: 'wellness' },
  { id: 'gift-48', name: 'Glow Ritual', emoji: '✨', priceCredits: 150, category: 'wellness' },
  { id: 'gift-49', name: 'Mindful Crown', emoji: '👁️', priceCredits: 320, category: 'wellness' },
  { id: 'gift-50', name: 'Luxury Calm', emoji: '💎', priceCredits: 500, category: 'wellness' },
] as const;

export function validateCreatorEligibility(followerCount: number | string, minimumFollowers: number | string = 1000): boolean {
  const count = Number(followerCount || 0);
  return Number.isFinite(count) && count >= Number(minimumFollowers || 0);
}

export function isValidOrangeMoneyNumber(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim().replace(/\s+/g, '');
  if (!cleaned) return false;
  if (cleaned.startsWith('+231')) {
    const tail = cleaned.slice(4);
    return /^\d{8,11}$/.test(tail) && tail.length >= 8 && tail.length <= 11;
  }
  if (cleaned.startsWith('07') || cleaned.startsWith('08') || cleaned.startsWith('05')) {
    return /^0\d{8,12}$/.test(cleaned) && cleaned.length >= 9 && cleaned.length <= 13;
  }
  return false;
}

export default {
  GIFT_CATEGORIES,
  GIFT_ITEMS,
  validateCreatorEligibility,
  isValidOrangeMoneyNumber,
};
