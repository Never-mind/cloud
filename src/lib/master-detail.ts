export function groupDetailsByMaster<T extends Record<K, string>, K extends keyof T>(
  details: T[],
  masterKey: K,
): Map<T[K], T[]> {
  const grouped = new Map<T[K], T[]>();

  for (const detail of details) {
    const key = detail[masterKey];
    grouped.set(key, [...(grouped.get(key) ?? []), detail]);
  }

  return grouped;
}

export function summarizeQuantity(details: Array<{ quantity: number | null }>): number {
  return details.reduce((total, detail) => total + (detail.quantity ?? 0), 0);
}
