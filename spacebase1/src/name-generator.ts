const ADJECTIVES = [
  'steady',
  'curious',
  'brisk',
  'luminous',
  'open',
  'tidal',
  'kind',
  'nimble',
];

const NOUNS = [
  'otter',
  'heron',
  'beacon',
  'comet',
  'pine',
  'harbor',
  'sparrow',
  'signal',
];

function pick<T>(items: T[], index: number): T {
  return items[index % items.length]!;
}

export function generateFriendlyAgentLabel(seed: string): string {
  let hash = 0;
  for (const ch of seed) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  const positive = Math.abs(hash);
  return `${pick(ADJECTIVES, positive)}-${pick(NOUNS, positive >> 3)}`;
}
