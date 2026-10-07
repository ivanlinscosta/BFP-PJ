/** Creates a deterministic mulberry32 pseudo-random generator. */
export function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a stable 32-bit hash for string keys used in deterministic branching. */
export function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/** Creates a keyed deterministic generator derived from the global dataset seed. */
export function createKeyedRandom(seed: number, key: string) {
  return mulberry32((seed ^ hashString(key)) >>> 0);
}
