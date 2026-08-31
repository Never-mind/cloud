export function normalizeDateOnlyValue(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  if (value instanceof Date) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  const text = String(value).trim();
  const dateParts = text.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (!dateParts) return text;

  // A browser can serialize a Chinese local date as the previous day's UTC time.
  // Date-only fields must keep the business date selected by the user.
  if (/[T\s].*(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return formatDateInTimeZone(parsed, "Asia/Shanghai");
  }

  return formatDateParts(Number(dateParts[1]), Number(dateParts[2]), Number(dateParts[3]));
}

function formatDateInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return formatDateParts(Number(byType.get("year")), Number(byType.get("month")), Number(byType.get("day")));
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
