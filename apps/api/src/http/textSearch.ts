export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function matchesSearchQuery(values: Array<string | null | undefined>, query?: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = normalizeSearchText(query);
  return values.some((value) => value && normalizeSearchText(value).includes(normalizedQuery));
}
