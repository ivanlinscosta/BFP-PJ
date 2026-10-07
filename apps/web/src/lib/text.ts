/** Lower-case, accent-free text used for client-side search. */
export function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Plural of a dimension label for counters ("Canal" → "canais", "Porte da empresa" → "portes"). */
export function pluralizeLabel(label: string, count: number) {
  const word = label.split(' ')[0]!.toLowerCase();
  if (count === 1) return word;
  if (word.endsWith('ão')) return `${word.slice(0, -2)}ões`;
  if (word.endsWith('al')) return `${word.slice(0, -1)}is`;
  if (word.endsWith('s')) return word;
  return `${word}s`;
}
