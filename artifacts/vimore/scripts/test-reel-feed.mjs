import assert from 'node:assert/strict';
import { seededShuffle, uniqueReels } from '../src/lib/reel-feed.ts';

const reels = Array.from({ length: 12 }, (_, index) => ({
  $id: `reel-${index}`,
  videoUrl: `/api/file/reel_media/file-${index}`,
}));

const firstOrder = seededShuffle(reels, 123);
assert.deepEqual(seededShuffle(reels, 123), firstOrder, 'A session order must remain stable');
assert.notDeepEqual(seededShuffle(reels, 456), firstOrder, 'A new session should reshuffle the same feed');
assert.deepEqual(
  uniqueReels([reels[0], { ...reels[0] }, { $id: 'duplicate-media', videoUrl: reels[0].videoUrl }]).map(reel => reel.$id),
  ['reel-0'],
  'Repeated reel documents and media files must be removed',
);
assert.deepEqual(
  uniqueReels([...reels.slice(0, 4), ...reels.slice(4)]).map(reel => reel.$id),
  reels.map(reel => reel.$id),
  'Unique items must retain their current page order',
);
console.log('Reel feed checks passed');
