type DisplayValue = string | number | boolean | Date | null | undefined;

type DisplayOption = { label: string; value: string };

/**
 * 系统内"创建 / 更新 / 确认"这一类日期时间列。
 *
 * 这三个字段在数据库里都是 DATETIME，展示和导出一律按 `YYYY-MM-DD HH:mm` 到分处理，
 * 避免各页面再各自写一套格式化（历史上出现过带秒、按 UTC 截取、只显示日期三种写法）。
 */
export const DATE_TIME_FIELD_KEYS = ["createdAt", "updatedAt", "confirmedAt"] as const;

export function isDateTimeFieldKey(key: string) {
  return (DATE_TIME_FIELD_KEYS as readonly string[]).includes(key);
}

/**
 * 接口返回前统一收口：把行上的 DATE / DATETIME 字段格式化成展示用字符串。
 *
 * 约定前端拿到的日期时间一定是 `YYYY-MM-DD HH:mm`、日期一定是 `YYYY-MM-DD`，
 * 前端不再对时间做字符串截取（`slice` 截 ISO 会按 UTC 取值，时间差 8 小时、日期还可能差一天）。
 */
export function normalizeTemporalFields<T>(
  value: T,
  spec: { date?: readonly string[]; datetime?: readonly string[] },
): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  for (const field of spec.datetime ?? []) {
    const current = row[field];
    if (current === undefined || current === null || current === "") continue;
    row[field] = formatDisplayValue(current as never, "datetime");
  }
  for (const field of spec.date ?? []) {
    const current = row[field];
    if (current === undefined || current === null || current === "") continue;
    row[field] = formatDisplayValue(current as never, "date");
  }
  return value;
}

// 复用格式化器实例：每次调用都新建 toLocaleString 的配置对象在批量导出时非常慢
// （几万行 × 几十列会产生几十万次创建），这里集中成两个实例。
const moneyFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

export function formatMoneyValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? moneyFormatter.format(number) : "-";
}

export function formatNumberValue(value: unknown) {
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
  if (type === "number") return formatNumberValue(value);
  if (type === "money") return formatMoneyValue(value);
  if (type === "percentage") return `${formatNumberValue(Number(value) * 100)}%`;
  if (type === "lineType") return formatLineType(value);
  // 排查用的日志类页面需要秒；其余日期时间一律到分。
  if (type === "datetime-seconds") return formatDateTimeValue(value, true);
  if (type === "datetime") return formatDateTimeValue(value);
  if (value instanceof Date) return formatLocalDate(value);
  if (isDateLikeValue(value, type)) return formatDateLikeString(String(value));
  if (typeof value === "number") return formatNumberValue(value);
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

function formatDateTimeValue(value: DisplayValue, withSeconds = false) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "-";
    const base = `${formatLocalDate(value)} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
    return withSeconds ? `${base}:${pad(value.getSeconds())}` : base;
  }
  return formatDateTimeLikeString(String(value), withSeconds);
}

/**
 * 日期时间统一格式：`YYYY-MM-DD HH:mm`（排查用的日志页面传 withSeconds 保留秒）。
 *
 * 带时区的值（`...Z` 或 `+08:00`）以及 `Date` 对象按本地时间换算；
 * 已经是本地格式的字符串直接截取，避免时区二次转换。
 */
function formatDateTimeLikeString(value: string, withSeconds = false) {
  const raw = value.trim();
  const normalized = raw.replace("T", " ");
  const localMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[\s](\d{2}:\d{2})(?::(\d{2}))?/);
  // 已经是本地格式的字符串直接截取，避免时区二次转换（数据库时间列由 SQL 侧格式化）。
  if (localMatch && !isZonedDateTime(raw)) {
    const seconds = localMatch[3] ?? "00";
    return withSeconds
      ? `${localMatch[1]} ${localMatch[2]}:${seconds}`
      : `${localMatch[1]} ${localMatch[2]}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return normalized;
  const base = `${formatLocalDate(parsed)} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  return withSeconds ? `${base}:${pad(parsed.getSeconds())}` : base;
}

function isZonedDateTime(value: string) {
  return value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
