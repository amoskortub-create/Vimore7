export interface FeedCandidate {
  $id: string;
  $createdAt?: string;
  user: { $id?: string; username?: string };
  likes: number;
  comments: number;
  shares: number;
  isBoosted?: boolean;
  boostExpiry?: number;
}

interface ComposeFeedOptions<T extends FeedCandidate> {
  candidates: T[];
  followingIds: Set<string>;
  friendsOfFriendsIds: Set<string>;
  viewedIds: Set<string>;
  userId: string;
  batch: number;
  now?: number;
  size?: number;
}

function timestamp(post: FeedCandidate): number {
  const value = post.$createdAt ? Date.parse(post.$createdAt) : 0;
  return Number.isFinite(value) ? value : 0;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function composeFeedBatch<T extends FeedCandidate>({
  candidates,
  followingIds,
  friendsOfFriendsIds,
  viewedIds,
  userId,
  batch,
  now = Date.now(),
  size = 30,
}: ComposeFeedOptions<T>): { posts: T[]; remaining: T[] } {
  const targets = [0.5, 0.2, 0.2, 0.1].map(ratio => Math.floor(size * ratio));
  targets[0] += size - targets.reduce((sum, count) => sum + count, 0);
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const post of candidates) {
    if (!post?.$id || seen.has(post.$id)) continue;
    seen.add(post.$id);
    unique.push(post);
  }

  const freshFirst = (a: T, b: T) => {
    const viewedDelta = Number(viewedIds.has(a.$id)) - Number(viewedIds.has(b.$id));
    return viewedDelta || timestamp(b) - timestamp(a);
  };
  const engagement = (post: T) => (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
  const recentCutoff = now - 3 * 24 * 60 * 60 * 1000;
  const picked = new Set<string>();
  const selected: T[] = [];

  const take = (pool: T[], count: number, compare: (a: T, b: T) => number = freshFirst) => {
    for (const post of [...pool].sort(compare)) {
      if (selected.length >= size || count <= 0) break;
      if (picked.has(post.$id)) continue;
      picked.add(post.$id);
      selected.push(post);
      count--;
    }
  };

  take(
    unique.filter(post => post.isBoosted && (!post.boostExpiry || post.boostExpiry > now)),
    targets[3],
  );
  take(unique.filter(post => friendsOfFriendsIds.has(post.user.$id || '')), targets[1]);
  take(
    unique.filter(post => {
      const created = timestamp(post);
      return !post.isBoosted && created >= recentCutoff && created <= now && engagement(post) > 0;
    }),
    targets[2],
    (a, b) => Number(viewedIds.has(a.$id)) - Number(viewedIds.has(b.$id)) ||
      engagement(b) - engagement(a) || timestamp(b) - timestamp(a),
  );
  take(unique.filter(post => followingIds.has(post.user.$id || '')), targets[0]);

  take(unique, size - selected.length);

  const posts = selected.sort((a, b) =>
    hash(`${userId}:${batch}:${a.$id}`) - hash(`${userId}:${batch}:${b.$id}`),
  );
  return { posts, remaining: unique.filter(post => !picked.has(post.$id)) };
}
