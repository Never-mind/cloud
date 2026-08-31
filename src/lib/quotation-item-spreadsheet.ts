export type QuotationItemSpreadsheetField = {
  key: string;
  label: string;
  note: string;
};

export const quotationItemImportFields: QuotationItemSpreadsheetField[] = [
  { key: "lineNo", label: "行号", note: "可选：优先按行号匹配报价明细" },
  { key: "productCode", label: "产品编码", note: "可选：行号为空时按产品编码匹配" },
  { key: "purchaseUnitPrice", label: "原币不含税采购单价", note: "可选：填写采购成本，需同时填写采购币种" },
  { key: "purchaseCurrency", label: "采购币种", note: "可选：如不填写则保留原明细币种" },
  { key: "ddpQuoteUnitUsd", label: "手动DDP不含税单价（USD）", note: "可选：填写后作为当前明细最终报价，并反算加价率" },
  { key: "quantity", label: "采购数量", note: "可选：不填写则保留原明细数量" },
  { key: "transportType", label: "运输方式", note: "可选：空运、海运或无运输" },
  { key: "isCustomsClearance", label: "是否清关", note: "可选：是/否" },
  { key: "enableNom", label: "是否需要NOM", note: "可选：是/否" },
  { key: "markupRate", label: "加价率（%）", note: "可选：不填写则保留原明细加价率" },
  { key: "remark", label: "备注", note: "可选：文本" },
];

export const quotationItemExportFields: QuotationItemSpreadsheetField[] = [
  { key: "lineNo", label: "行号", note: "" },
  { key: "productCode", label: "产品编码", note: "" },
  { key: "productName", label: "产品名称", note: "" },
  { key: "brand", label: "品牌", note: "" },
  { key: "quantity", label: "采购数量", note: "" },
  { key: "purchaseCurrency", label: "采购币种", note: "" },
  { key: "purchaseUnitPrice", label: "原币不含税采购单价", note: "" },
  { key: "purchaseTotalOriginal", label: "不含税采购总价（原币）", note: "" },
  { key: "purchaseTotalUsd", label: "不含税采购总价（USD）", note: "" },
  { key: "transportType", label: "运输方式", note: "" },
  { key: "isCustomsClearance", label: "是否清关", note: "" },
  { key: "firstMileFreightUsd", label: "头程运费（USD）", note: "" },
  { key: "cifUsd", label: "CIF（USD）", note: "" },
  { key: "tariffRate", label: "关税税率（%）", note: "" },
  { key: "tariffUsd", label: "关税金额（USD）", note: "" },
  { key: "capitalCostUsd", label: "资金成本（USD）", note: "" },
  { key: "customsFeeUsd", label: "清关手续费（USD）", note: "" },
  { key: "nomFeeUsd", label: "NOM认证费（USD）", note: "" },
  { key: "publicFeeAllocationUsd", label: "公共费用分摊（USD）", note: "" },
  { key: "ddpTotalUsd", label: "到仓总价（USD）", note: "" },
  { key: "ddpUnitPriceUsd", label: "到仓单价（USD）", note: "" },
  { key: "markupRate", label: "加价率（%）", note: "" },
  { key: "historicalDdpQuoteUsd", label: "历史参考报价（USD）", note: "" },
  { key: "ddpQuoteUnitUsd", label: "手动DDP不含税单价（USD）", note: "" },
  { key: "unitPrice", label: "DDP不含税单价（USD）", note: "" },
  { key: "amount", label: "DDP不含税总价（USD）", note: "" },
  { key: "operatingProfitUsd", label: "利润（USD）", note: "" },
  { key: "grossMarginRate", label: "毛利率（%）", note: "" },
  { key: "productMasterId", label: "产品主档ID", note: "" },
  { key: "remark", label: "备注", note: "" },
];

export const quotationItemImportAliases: Record<string, string> = {
  "行号": "lineNo",
  "产品编码": "productCode",
  "原币不含税采购单价": "purchaseUnitPrice",
  "不含税采购单价": "purchaseUnitPrice",
  "原币不含税单价": "purchaseUnitPrice",
  "不含税单价": "purchaseUnitPrice",
  "采购币种": "purchaseCurrency",
  "手动DDP不含税单价（USD）": "ddpQuoteUnitUsd",
  "手动DDP不含税单价": "ddpQuoteUnitUsd",
  "DDP不含税单价（USD）": "ddpQuoteUnitUsd",
  "采购数量": "quantity",
  "数量": "quantity",
  "运输方式": "transportType",
  "是否清关": "isCustomsClearance",
  "是否需要NOM": "enableNom",
  "加价率（%）": "markupRate",
  "加价率": "markupRate",
  "备注": "remark",
};

export function isQuotationItemTemplateNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return values.length > 0 && values.every((value) =>
    value === "必填" || value === "可选" || value.startsWith("必填：") || value.startsWith("可选："),
  );
}

export function normalizeQuotationItemTransport(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["air", "空运"].includes(normalized)) return "air";
  if (["none", "无运输", "无"].includes(normalized)) return "none";
  if (["sea", "海运"].includes(normalized)) return "sea";
  return "";
}

export function normalizeQuotationItemBoolean(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["是", "true", "yes", "1", "y"].includes(normalized)) return true;
  if (["否", "false", "no", "0", "n"].includes(normalized)) return false;
  return undefined;
}

export function parseQuotationItemNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatQuotationItemExportValue(key: string, value: unknown) {
  if (value === null || value === undefined) return "";
  if (["isCustomsClearance", "enableNom"].includes(key)) return value ? "是" : "否";
  if (key === "transportType") {
    return value === "air" ? "空运" : value === "sea" ? "海运" : value === "none" ? "无运输" : String(value);
  }
  if (key === "grossMarginRate") return Number(value) * 100;
  return value;
}
