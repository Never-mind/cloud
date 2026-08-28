type DisplayValue = string | number | boolean | Date | null | undefined;

export function formatDateInputValue(value: DisplayValue) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatLocalDate(value);
  return formatDateLikeString(String(value));
}

export function formatDisplayValue(value: DisplayValue, type?: string) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "boolean") return value ? "是" : "否";
  if (type === "number") return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (type === "money") return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (type === "percentage") return `${(Number(value) * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
  if (type === "lineType") return formatLineType(value);
  if (type === "datetime") return formatDateTimeLikeString(String(value));
  if (value instanceof Date) return formatLocalDate(value);
  if (isDateLikeValue(value, type)) return formatDateLikeString(String(value));
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(value);
}

function formatLineType(value: DisplayValue) {
  const text = String(value ?? "").trim();
  if (text === "instance") return "实例";
  if (text === "fee") return "非实例费用";
  return text || "-";
}

function isDateLikeValue(value: DisplayValue, type?: string) {
  if (type === "date" || type === "datetime") return true;
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)?$/.test(value);
}

function formatDateLikeString(value: string) {
  if (value.includes("T") && value.endsWith("Z")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatLocalDate(date);
  }
  return value.slice(0, 10);
}

function formatDateTimeLikeString(value: string) {
  const normalized = value.replace("T", " ");
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[\s](\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : normalized;
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
