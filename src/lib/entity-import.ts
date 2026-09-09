import type { Row } from "./db";
import { normalizeInstanceModelType, requireInstanceModelType } from "./instance-model-type";
import type { EntityConfig } from "./modules";

export type ImportFailure = {
  rowNumber: number;
  primaryKey: string;
  error: string;
};

export type ImportReport = {
  total: number;
  success: number;
  failed: ImportFailure[];
};

export async function importRowsWithReport(
  config: EntityConfig,
  rows: Row[],
  upsertRow: (row: Row) => Promise<void>,
): Promise<ImportReport> {
  const failed: ImportFailure[] = [];
  let success = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const validationError = validateEntityImportRow(config, row);
      if (validationError) throw new Error(validationError);

      await upsertRow(row);
      success += 1;
    } catch (error) {
      failed.push({
        rowNumber: index + 2,
        primaryKey: String(row[config.primaryKey] ?? ""),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { total: rows.length, success, failed };
}

export function normalizeEntityImportRow(config: EntityConfig, row: Row): Row {
  const normalized = Object.fromEntries(
    config.formFields.map((field) => {
      const value = row[field.key];
      if (field.type === "boolean") return [field.key, normalizeBooleanValue(value)];
      if (field.type === "number") return [field.key, normalizeNumberValue(value)];
      if (field.type === "date") return [field.key, normalizeDateValue(value)];
      if (field.type === "datetime") return [field.key, normalizeDateTimeValue(value)];
      return [field.key, value === "" || value === undefined ? null : value];
    }),
  );

  if (config.key === "instance-models") {
    normalized.instanceType = normalizeInstanceModelType(normalized.instanceType);
  }
  return normalized;
}

/**
 * Maps spreadsheet headers to the internal field names used by an entity.
 *
 * Excel users commonly change the casing/spacing of `ID` and the logistics
 * template historically used "收货地址ID" and "收件人ID". Keep those
 * variants importable while retaining the configured labels as the source of
 * truth for all other entities.
 */
export function mapEntityImportRow(config: EntityConfig, row: Record<string, unknown>): Row {
  const fieldByHeader = new Map(
    config.formFields.flatMap((field) => [
      [normalizeImportHeader(field.label), field.key],
      [normalizeImportHeader(field.key), field.key],
    ]),
  );

  // Historical datacenter templates called this field "物理地址ID".
  if (config.key === "datacenters") fieldByHeader.set(normalizeImportHeader("物理地址ID"), "locationId");

  if (config.key === "shipments") {
    const shipmentAliases: Record<string, string> = {
      "机房": "dcCode",
      "机房名称": "dcCode",
      // The export uses display-field labels. Users commonly fill the IDs
      // back into those same columns before importing the workbook.
      "收货地址": "destinationLocationId",
      "收货地址ID": "destinationLocationId",
      "收货地址编号": "destinationLocationId",
      "目的地址ID": "destinationLocationId",
      "收件人": "recipientContactId",
      "收件人ID": "recipientContactId",
      "收件人编号": "recipientContactId",
      "收件人信息ID": "recipientContactId",
      "收件联系人编号": "recipientContactId",
    };
    for (const [header, field] of Object.entries(shipmentAliases)) {
      fieldByHeader.set(normalizeImportHeader(header), field);
    }
  }

  return Object.fromEntries(
    Object.entries(row)
      .map(([header, value]) => [fieldByHeader.get(normalizeImportHeader(header)) ?? header, value])
      .filter(([field]) => config.formFields.some((item) => item.key === field)),
  );
}

export function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();
}

export function validateEntityImportRow(config: EntityConfig, row: Row) {
  for (const field of config.formFields) {
    if (field.required && isBlank(row[field.key])) {
      return `${field.label}不能为空`;
    }
    if (field.type === "number" && !isBlank(row[field.key]) && Number.isNaN(Number(row[field.key]))) {
      return `${field.label}必须是数字`;
    }
    if (config.key === "instance-models" && field.key === "instanceType") {
      try {
        requireInstanceModelType(row[field.key]);
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  }

  return "";
}

export function isEntityTemplateNoteRow(config: EntityConfig, row: Record<string, unknown>) {
  const fieldLabels = new Set(config.formFields.map((field) => field.label));
  const values = Object.entries(row)
    .filter(([label]) => fieldLabels.has(label))
    .map(([, value]) => String(value ?? "").trim())
    .filter(Boolean);

  if (!values.length) return true;

  return values.every(
    (value) =>
      value === "必填" ||
      value === "可选" ||
      value.startsWith("必填：") ||
      value.startsWith("可选："),
  );
}

function normalizeBooleanValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (["是", "已签收", "签收", "true", "yes", "y", "1"].includes(normalized)) return true;
  if (["否", "未签收", "false", "no", "n", "0"].includes(normalized)) return false;
  return Boolean(normalized);
}

function normalizeNumberValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return null;
  return Number(value);
}

function normalizeDateValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return null;
  if (value instanceof Date) return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());

  if (typeof value === "number" || (typeof value === "string" && /^\d{5}(?:\.\d+)?$/.test(value.trim()))) {
    const serial = Number(value);
    if (serial > 0 && serial < 100000) {
      const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
      return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }

  const text = String(value).trim();
  const ymd = text.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
  if (ymd) return formatDateParts(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const isoDate = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());

  return text;
}

function normalizeDateTimeValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return null;

  if (value instanceof Date) {
    return `${formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate())} ${formatTimeParts(
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
    )}`;
  }

  const text = String(value).trim();
  const match = text.match(
    /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (match) {
    const date = formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    return `${date} ${formatTimeParts(Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0))}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())} ${formatTimeParts(
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds(),
    )}`;
  }

  return text;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatTimeParts(hour: number, minute: number, second: number) {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

export function buildImportMessage(report: ImportReport) {
  const lines = [`导入完成：共 ${report.total} 条，成功 ${report.success} 条，失败 ${report.failed.length} 条。`];

  if (report.failed.length) {
    lines.push("失败数据：");
    lines.push(
      ...report.failed.map((failure) =>
        `第 ${failure.rowNumber} 行${failure.primaryKey ? `（${failure.primaryKey}）` : ""}：${failure.error}`,
      ),
    );
  }

  return lines.join("\n");
}

function isBlank(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}
