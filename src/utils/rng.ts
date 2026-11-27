export function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed: string): () => number {
  let a = hashSeed(seed || 'BLOCKWORKS');
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_PREFIXES = ['NEO', 'HASH', 'CYBER', 'APEX', 'GRID', 'ZERO', 'NODE', 'VAULT'];

export function generateRandomSeed(): string {
  const prefix = SEED_PREFIXES[Math.floor(Math.random() * SEED_PREFIXES.length)];
  const code = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${code}`;
}
