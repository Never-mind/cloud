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

/**
 * 去掉用户输入里的前导 0，同时保留正在输入中的写法。
 *
 * - `0099` → `99`，`00.5` → `0.5`，`-007` → `-7`
 * - `0`、`0.`、`0.05`、`.` 保持不变，否则没法输入 0.057 这类小于 1 的小数
 */
export function normalizeNumericInputText(text: string) {
  if (!text) return text;
  return text.replace(/^(-?)0+(?=\d)/, "$1");
}

/** 数字输入框的展示值：0 显示为空，避免用户输入 88 得到 088。 */
export function numericInputDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return Number(trimmed) === 0 ? "" : normalizeNumericInputText(trimmed);
  }
  return formatNumericInputValue(value);
}
