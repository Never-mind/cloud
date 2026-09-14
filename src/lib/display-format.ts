type DisplayValue = string | number | boolean | Date | null | undefined;

type DisplayOption = { label: string; value: string };

// 复用格式化器实例：每次调用都新建 toLocaleString 的配置对象在批量导出时非常慢
// （几万行 × 几十列会产生几十万次创建），这里集中成两个实例。
const moneyFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function formatMoney(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? moneyFormatter.format(number) : "-";
}

function formatNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormatter.format(number) : "-";
}

export function formatDateInputValue(value: DisplayValue) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatLocalDate(value);
  return formatDateLikeString(String(value));
}

export function formatDisplayValue(value: DisplayValue, type?: string) {
  if (value === null || value === undefined || value === "") return "-";
  if (type === "boolean") return value ? "是" : "否";
  if (type === "number") return formatNumber(value);
  if (type === "money") return formatMoney(value);
  if (type === "percentage") return `${formatNumber(Number(value) * 100)}%`;
  if (type === "lineType") return formatLineType(value);
  if (type === "datetime") return formatDateTimeLikeString(String(value));
  if (value instanceof Date) return formatLocalDate(value);
  if (isDateLikeValue(value, type)) return formatDateLikeString(String(value));
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

export function formatConfiguredDisplayValue(value: DisplayValue, type?: string, options?: DisplayOption[]) {
  const option = options?.find((item) => item.value === String(value ?? ""));
  return option?.label ?? formatDisplayValue(value, type);
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
