import { execute, hasTableColumn, queryRows, type Row } from "./db";

const PURCHASE_ITEM_POWER_PRICE_COLUMNS = [
  "powerPricingJson",
  "powerFirst24VatIncluded",
  "powerNext36VatIncluded",
  "powerFirst24Manual",
  "powerNext36Manual",
] as const;

type PurchaseItemPowerPriceColumn = typeof PURCHASE_ITEM_POWER_PRICE_COLUMNS[number];

export type InstanceContractPriceReference = {
  contractNo: string;
  dateSigned: string | null;
  currency: string;
  first24MonthPriceUSD: number | null;
  next36MonthPriceUSD: number | null;
};

export async function isPurchaseItemPowerPricingStorageReady() {
  const columns = await Promise.all(
    PURCHASE_ITEM_POWER_PRICE_COLUMNS.map((column) => hasTableColumn("purchaseorderitems", column)),
  );
  return columns.every(Boolean);
}

export function hasPurchaseItemPowerPricingPayload(body: Row) {
  return PURCHASE_ITEM_POWER_PRICE_COLUMNS.some((column) => body[column] !== undefined);
}

export async function assertPurchaseItemPowerPricingStorage(body: Row) {
  if (!hasPurchaseItemPowerPricingPayload(body)) return;
  if (await isPurchaseItemPowerPricingStorageReady()) return;
  throw new Error("采购订单算力服务费测算字段尚未创建，请先执行本次提供的数据库迁移 SQL 后再保存测算结果。");
}

export async function persistPurchaseItemPowerPricing(itemId: string, body: Row) {
  if (!hasPurchaseItemPowerPricingPayload(body)) return;
  await assertPurchaseItemPowerPricingStorage(body);
  const values = normalizePurchaseItemPowerPricingPayload(body);
  const assignments = Object.keys(values)
    .map((column) => `\`${column}\` = :${column}`)
    .join(", ");
  if (!assignments) return;
  await execute(
    `UPDATE purchaseorderitems SET ${assignments} WHERE id = :id`,
    { ...values, id: itemId },
  );
}

export async function persistPurchaseOrderUsdRate(purchaseOrderId: string, body: Row) {
  if (body.usdRate === undefined) return;
  if (!(await hasTableColumn("purchaseorders", "usdRate"))) return;
  const parsed = Number(body.usdRate);
  await execute(
    "UPDATE purchaseorders SET usdRate = :usdRate WHERE purchaseOrderId = :purchaseOrderId",
    { purchaseOrderId, usdRate: Number.isFinite(parsed) ? parsed : null },
  );
}

export async function listInstanceContractPriceReferences(countryCode: string, deviceCode: string) {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const normalizedDeviceCode = String(deviceCode ?? "").trim();
  if (!normalizedCountryCode || !normalizedDeviceCode) return [] as InstanceContractPriceReference[];

  return queryRows<InstanceContractPriceReference>(
    `
      SELECT
        contractNo,
        DATE_FORMAT(dateSigned, '%Y-%m-%d') AS dateSigned,
        COALESCE(NULLIF(currency, ''), 'USD') AS currency,
        first24MonthPriceUSD,
        next36MonthPriceUSD
      FROM instancecontracts
      WHERE UPPER(TRIM(SUBSTRING_INDEX(countryCode, '-', 1))) = :countryCode
        AND deviceCode = :deviceCode
        AND (first24MonthPriceUSD IS NOT NULL OR next36MonthPriceUSD IS NOT NULL)
      ORDER BY dateSigned DESC, createdAt DESC, contractNo DESC
      LIMIT 5
    `,
    { countryCode: normalizedCountryCode, deviceCode: normalizedDeviceCode },
  );
}

function normalizePurchaseItemPowerPricingPayload(body: Row): Partial<Record<PurchaseItemPowerPriceColumn, string | number>> {
  const result: Partial<Record<PurchaseItemPowerPriceColumn, string | number>> = {};
  if (body.powerPricingJson !== undefined) {
    result.powerPricingJson = typeof body.powerPricingJson === "string"
      ? body.powerPricingJson
      : JSON.stringify(body.powerPricingJson);
  }
  if (body.powerFirst24VatIncluded !== undefined) result.powerFirst24VatIncluded = numericValue(body.powerFirst24VatIncluded);
  if (body.powerNext36VatIncluded !== undefined) result.powerNext36VatIncluded = numericValue(body.powerNext36VatIncluded);
  if (body.powerFirst24Manual !== undefined) result.powerFirst24Manual = booleanValue(body.powerFirst24Manual);
  if (body.powerNext36Manual !== undefined) result.powerNext36Manual = booleanValue(body.powerNext36Manual);
  return result;
}

function normalizeCountryCode(value: unknown) {
  const source = String(value ?? "").trim().toUpperCase();
  if (source === "墨西哥") return "MX";
  if (source === "智利") return "CL";
  if (source === "巴西") return "BR";
  return source.split("-")[0];
}

function numericValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}
