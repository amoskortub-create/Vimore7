export type ReelIdentity = {
  $id: string;
  videoUrl?: string;
};

function seededKey(id: string, seed: number): number {
  let hash = seed | 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function seededShuffle<T extends ReelIdentity>(items: T[], seed: number): T[] {
  return [...items].sort((a, b) => {
    const keyDifference = seededKey(a.videoUrl || a.$id, seed) - seededKey(b.videoUrl || b.$id, seed);
    return keyDifference || a.$id.localeCompare(b.$id);
  });
}

export function uniqueReels<T extends ReelIdentity>(items: T[]): T[] {
  const seenIds = new Set<string>();
  const seenMedia = new Set<string>();
  return items.filter(item => {
    if (!item.$id || seenIds.has(item.$id)) return false;
    seenIds.add(item.$id);
    if (!item.videoUrl) return true;
    if (seenMedia.has(item.videoUrl)) return false;
    seenMedia.add(item.videoUrl);
    return true;
  });
}
