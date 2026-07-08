export function formatNumericInputValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number(value) === 0) return "";
  return String(value);
}

export function parseNumericInputValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
