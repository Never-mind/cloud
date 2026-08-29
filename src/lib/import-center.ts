import { randomUUID } from "crypto";
import { buildMonthlyBillingRows, firstDayOfMonth as firstBillingMonth } from "./billing-workflow";
import type { Row } from "./db";
import { buildMonthlyWriteOffRows, firstDayOfMonth as firstPrepaymentMonth } from "./prepayment-workflow";
import { buildPurchaseOrderItemRows, PURCHASE_CURRENCY_OPTIONS } from "./purchase-order-form";
import { buildAutoPurchaseOrderId, normalizeRequestNos } from "./procurement-workflow";
import { buildRequestItemRows } from "./request-order-form";
import { isRequestType } from "./request-type";
import { normalizePartyReferenceRow, type PartyReferenceRow } from "./party-reference";

export type ImportTargetKey =
  | "request-orders"
  | "purchase-orders"
  | "instance-contracts"
  | "billing-ledgers"
  | "prepayment-contracts";

export type ImportStrategy = "create-only" | "overwrite-drafts" | "overwrite-all";

export type ImportTemplateColumn = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "date";
  note?: string;
};

export type ImportTarget = {
  key: ImportTargetKey;
  title: string;
  description: string;
  columns: ImportTemplateColumn[];
};

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

export type ImportPreview = {
  targetKey: ImportTargetKey;
  strategy?: ImportStrategy;
  report: ImportReport;
  summary: {
    masterCount: number;
    detailCount: number;
  };
  execution?: {
    create: number;
    updateDraft: number;
    updateConfirmed: number;
    skip: number;
  };
  operations: {
    requests: Row[];
    requestItems: Row[];
    purchaseOrders: Row[];
    purchaseOrderItems: Row[];
    instanceContracts: Row[];
    billingLedgers: Row[];
    monthlyBillingWriteOffs: Row[];
    prepaymentContracts: Row[];
    prepaymentContractItems: Row[];
    monthlyPrepaymentWriteOffs: Row[];
  };
};

export const IMPORT_TARGETS: ImportTarget[] = [
  {
    key: "request-orders",
    title: "需求单主从导入",
    description: "按需求单号自动生成需求单主单和需求明细。",
    columns: [
      { key: "requestNo", label: "需求单号", required: true },
      { key: "countryCode", label: "国家", required: true },
      { key: "contractNo", label: "合同号", required: true },
      { key: "batchName", label: "批次号", required: true },
      { key: "requestType", label: "需求类型", required: true },
      { key: "status", label: "需求单状态", note: "为空默认草稿" },
      { key: "plannedDeliveryDate", label: "计划交付日期", type: "date" },
      { key: "requestedAt", label: "需求时间", type: "date" },
      { key: "deviceCode", label: "设备编码", required: true },
      { key: "supplierId", label: "供应商ID", required: true },
      { key: "undertakingUnitId", label: "承接单位ID", required: true },
      { key: "customerId", label: "客户ID" },
      { key: "quantity", label: "节点数量", required: true, type: "number" },
    ],
  },
  {
    key: "purchase-orders",
    title: "采购订单主从导入",
    description: "按系统采购ID或PO订单号自动生成采购主单和采购明细。",
    columns: [
      { key: "purchaseOrderId", label: "系统采购ID", note: "为空自动生成" },
      { key: "poNo", label: "PO订单号", required: true },
      { key: "requestNo", label: "来源需求单号", required: true },
      { key: "deviceCode", label: "产品编码", note: "与需求明细ID二选一，按来源需求单号匹配" },
      { key: "status", label: "采购状态", note: "为空默认草稿" },
      { key: "currency", label: "币种", required: true, note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "releasedAt", label: "下发日期", type: "date" },
      { key: "requestItemId", label: "需求明细ID", note: "与产品编码二选一" },
      { key: "requestType", label: "需求类型", note: "为空时按需求明细自动带出" },
      { key: "taxExcludedUnitPrice", label: "不含税单价", type: "number" },
      { key: "taxSurcharge", label: "税费加成", type: "number" },
      { key: "unitPrice", label: "含税单价", required: true, type: "number" },
      { key: "hardwareCoefficient", label: "硬件系数", type: "number" },
      { key: "softwareCoefficient", label: "软件系数", type: "number" },
    ],
  },
  {
    key: "instance-contracts",
    title: "实例合同导入",
    description: "按合同号、国家、设备编码导入实例合同价格。",
    columns: [
      { key: "contractNo", label: "合同号", required: true },
      { key: "countryCode", label: "国家", required: true },
      { key: "deviceCode", label: "设备编码", required: true },
      { key: "modelCode", label: "机型", note: "为空时按设备编码自动带出" },
      { key: "instanceModelEn", label: "实例型号英文", note: "为空时按设备编码自动带出" },
      { key: "currency", label: "币种", required: true, note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "first24MonthPriceUSD", label: "前24个月含税单价", required: true, type: "number" },
      { key: "next36MonthPriceUSD", label: "后36个月含税单价", required: true, type: "number" },
    ],
  },
  {
    key: "billing-ledgers",
    title: "月账单台账初始化导入",
    description: "首次对账时批量初始化月账单台账，并自动生成60个月账单每月核销明细。",
    columns: [
      { key: "ledgerId", label: "月账单台账ID", note: "为空自动生成" },
      { key: "purchaseOrderItemId", label: "采购明细ID", note: "可为空，按需求单号、PO单号、实例编码自动匹配" },
      { key: "countryCode", label: "国家", note: "为空按采购明细自动匹配" },
      { key: "batchName", label: "批次号", note: "为空按采购明细自动匹配" },
      { key: "requestNo", label: "需求单号", required: true },
      { key: "poNo", label: "PO订单号", required: true },
      { key: "deviceCode", label: "实例编码", required: true },
      { key: "modelCode", label: "机型" },
      { key: "nameEn", label: "实例名称（英文）" },
      { key: "quantity", label: "数量", type: "number", note: "为空按采购明细自动匹配" },
      { key: "actualCurrency", label: "实际币种", note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "actualUnitPrice", label: "实际单价", type: "number" },
      { key: "instanceContractNo", label: "实例合同号", required: true },
      { key: "contractCurrency", label: "合同币种", note: "按实例合同号、国家和实例编码自动带出" },
      { key: "first24MonthPrice", label: "前24个月合同价", type: "number", note: "按实例合同自动带出并覆盖不一致值" },
      { key: "next36MonthPrice", label: "后36个月合同价", type: "number", note: "按实例合同自动带出并覆盖不一致值" },
      { key: "startMonth", label: "起始核销月份", required: true, type: "date" },
      { key: "status", label: "台账状态", note: "为空默认核销中" },
      { key: "requestType", label: "需求类型", note: "按采购明细自动带出；备件不参与月账单" },
    ],
  },
  {
    key: "prepayment-contracts",
    title: "预付款合同初始化导入",
    description: "首次对账时批量初始化预付款合同及明细；导入后统一生成草稿，确认合同后再生成24个月预付款每月核销明细。",
    columns: [
      { key: "contractNo", label: "预付款合同号", required: true },
      { key: "status", label: "合同状态", note: "导入后统一生成草稿" },
      { key: "currency", label: "合同币种", required: true, note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "effectiveDate", label: "生效日期", required: true, type: "date" },
      { key: "lineType", label: "明细类型", note: "instance/fee，默认instance" },
      { key: "requestType", label: "需求类型", note: "实例行为空时按采购明细自动带出；费用行可为空" },
      { key: "purchaseOrderItemId", label: "采购明细ID" },
      { key: "requestItemId", label: "需求明细ID" },
      { key: "countryCode", label: "国家" },
      { key: "batchName", label: "批次号" },
      { key: "requestNo", label: "需求单号", note: "实例行必填；费用行可为空" },
      { key: "poNo", label: "PO订单号", note: "实例行必填；费用行可为空" },
      { key: "deviceCode", label: "实例编码", note: "实例行必填；费用行可为空" },
      { key: "modelCode", label: "机型" },
      { key: "nameEn", label: "实例名称（英文）" },
      { key: "quantity", label: "数量", type: "number" },
      { key: "actualCurrency", label: "实际币种", note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "actualUnitPrice", label: "实际单价", type: "number" },
      { key: "actualTotalAmount", label: "实际总价", type: "number" },
      { key: "contractCurrency", label: "预付款币种", required: true, note: PURCHASE_CURRENCY_OPTIONS.join("/") },
      { key: "contractUnitPrice", label: "预付款单价", type: "number" },
      { key: "contractTotalAmount", label: "预付款总价", required: true, type: "number" },
      { key: "writeOffStartMonth", label: "起始核销月份", required: true, type: "date" },
      { key: "feeName", label: "费用名称" },
      { key: "feeDescription", label: "费用说明" },
    ],
  },
];

export function listImportTargets() {
  return IMPORT_TARGETS;
}

export function getImportTarget(targetKey: string) {
  return IMPORT_TARGETS.find((target) => target.key === targetKey);
}

export function getImportTemplateColumns(targetKey: ImportTargetKey) {
  const target = getRequiredTarget(targetKey);
  return target.columns;
}

export function isImportTemplateNoteRow(row: Record<string, unknown>) {
  const values = Object.values(row)
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  if (!values.length) return true;

  return values.every(
    (value) =>
      value === "必填" ||
      value === "可选" ||
      value.startsWith("必填") ||
      value.startsWith("可选") ||
      value.startsWith("为空默认") ||
      value.startsWith("为空自动") ||
      value === PURCHASE_CURRENCY_OPTIONS.join("/"),
  );
}

export function buildImportPreview(
  targetKey: ImportTargetKey,
  inputRows: Row[],
  options: {
    requestItems?: Row[];
    purchaseOrders?: Row[];
    instanceModels?: Row[];
    instanceContracts?: Row[];
    billingPurchaseLines?: Row[];
    prepaymentPurchaseLines?: Row[];
    partyReferences?: {
      suppliers: PartyReferenceRow[];
      undertakingUnits: PartyReferenceRow[];
      customers: PartyReferenceRow[];
    };
  } = {},
): ImportPreview {
  const target = getRequiredTarget(targetKey);
  const validRows: Array<{ row: Row; rowNumber: number }> = [];
  const failed: ImportFailure[] = [];
  const requestTypeByRequestNo = new Map<string, string>();

  inputRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRow(target, row);
    const partyReferenceError = normalizePartyReferenceRow(normalized, options.partyReferences);
    let error =
      partyReferenceError ||
      validateRow(target, normalized) ||
      normalizeInstanceContractModel(targetKey, normalized, options.instanceModels ?? []) ||
      normalizePurchaseRequestItemId(targetKey, normalized, options.requestItems ?? []) ||
      normalizeBillingPurchaseLine(targetKey, normalized, options.billingPurchaseLines ?? []) ||
      normalizeBillingRequestType(targetKey, normalized) ||
      normalizeBillingInstanceContract(targetKey, normalized, options.instanceContracts ?? []) ||
      normalizePrepaymentPurchaseLine(targetKey, normalized, options.prepaymentPurchaseLines ?? []);
    if (!error && targetKey === "request-orders") {
      const requestNo = String(normalized.requestNo ?? "").trim();
      const requestType = String(normalized.requestType ?? "").trim();
      const existingType = requestTypeByRequestNo.get(requestNo);
      if (existingType && existingType !== requestType) {
        error = `同一需求单只能选择一种类型，当前同时存在${existingType}和${requestType}`;
      } else {
        requestTypeByRequestNo.set(requestNo, requestType);
      }
    }
    if (error) {
      failed.push({
        rowNumber,
        primaryKey: getPrimaryKeyText(targetKey, normalized),
        error,
      });
      return;
    }
    validRows.push({ row: normalized, rowNumber });
  });

  const operations = buildEmptyOperations();
  if (targetKey === "request-orders") buildRequestOperations(validRows.map((item) => item.row), operations);
  if (targetKey === "purchase-orders") buildPurchaseOperations(validRows.map((item) => item.row), operations, options.purchaseOrders ?? []);
  if (targetKey === "instance-contracts") buildInstanceContractOperations(validRows.map((item) => item.row), operations);
  if (targetKey === "billing-ledgers") buildBillingLedgerOperations(validRows.map((item) => item.row), operations);
  if (targetKey === "prepayment-contracts") buildPrepaymentContractOperations(validRows.map((item) => item.row), operations);

  return {
    targetKey,
    report: {
      total: inputRows.length,
      success: validRows.length,
      failed,
    },
    summary: {
      masterCount:
        operations.requests.length +
        operations.purchaseOrders.length +
        operations.instanceContracts.length +
        operations.billingLedgers.length +
        operations.prepaymentContracts.length,
      detailCount:
        operations.requestItems.length +
        operations.purchaseOrderItems.length +
        operations.monthlyBillingWriteOffs.length +
        operations.prepaymentContractItems.length +
        operations.monthlyPrepaymentWriteOffs.length,
    },
    operations,
  };
}

function buildEmptyOperations(): ImportPreview["operations"] {
  return {
    requests: [],
    requestItems: [],
    purchaseOrders: [],
    purchaseOrderItems: [],
    instanceContracts: [],
    billingLedgers: [],
    monthlyBillingWriteOffs: [],
    prepaymentContracts: [],
    prepaymentContractItems: [],
    monthlyPrepaymentWriteOffs: [],
  };
}

function buildRequestOperations(rows: Row[], operations: ImportPreview["operations"]) {
  const grouped = groupBy(rows, (row) => String(row.requestNo));

  for (const [requestNo, groupRows] of grouped) {
    const first = groupRows[0];
    operations.requests.push({
      requestNo,
      countryCode: first.countryCode,
      contractNo: first.contractNo,
      batchName: first.batchName,
      requestType: first.requestType,
      status: first.status || "草稿",
      plannedDeliveryDate: first.plannedDeliveryDate || null,
    });
    operations.requestItems.push(
      ...buildRequestItemRows({
        requestNo,
        requestedAt: String(first.requestedAt || first.plannedDeliveryDate || new Date().toISOString().slice(0, 10)),
        details: groupRows.map((row) => ({
          deviceCode: String(row.deviceCode),
          supplierId: String(row.supplierId),
          undertakingUnitId: String(row.undertakingUnitId ?? ""),
          customerId: String(row.customerId ?? ""),
          requestType: String(row.requestType ?? "整机"),
          quantity: Number(row.quantity),
        })),
      }),
    );
  }
}

function buildPurchaseOperations(rows: Row[], operations: ImportPreview["operations"], existingPurchaseOrders: Row[] = []) {
  const systemIdByPoNo = new Map(
    existingPurchaseOrders
      .filter((order) => !isBlank(order.poNo) && !isBlank(order.purchaseOrderId))
      .map((order) => [String(order.poNo).trim(), String(order.purchaseOrderId).trim()]),
  );
  const grouped = groupBy(rows, (row) => {
    const poNo = String(row.poNo).trim();
    const purchaseOrderId = String(systemIdByPoNo.get(poNo) || row.purchaseOrderId || buildAutoPurchaseOrderId());
    systemIdByPoNo.set(poNo, purchaseOrderId);
    row.purchaseOrderId = purchaseOrderId;
    return purchaseOrderId;
  });

  for (const [purchaseOrderId, groupRows] of grouped) {
    const first = groupRows[0];
    const sourceRequestNos = normalizeRequestNos(groupRows.map((row) => String(row.requestNo)));
    operations.purchaseOrders.push({
      purchaseOrderId,
      poNo: first.poNo,
      requestNo: sourceRequestNos,
      sourceRequestNos,
      status: first.status || "草稿",
      currency: first.currency,
      usdRate: 1,
      paymentDate: null,
      releasedAt: first.releasedAt || null,
    });
    operations.purchaseOrderItems.push(
      ...buildPurchaseOrderItemRows({
        purchaseOrderId,
        poNo: String(first.poNo),
        details: groupRows.map((row) => {
          const taxExcludedUnitPrice = Number(row.taxExcludedUnitPrice ?? row.unitPrice ?? 0);
          const importedUnitPrice = Number(row.unitPrice ?? 0);
          const importedTaxSurcharge = Number(row.taxSurcharge ?? 0);
          const taxSurcharge = importedTaxSurcharge || Math.max(0, importedUnitPrice - taxExcludedUnitPrice);
          return {
            requestNo: String(row.requestNo),
            requestItemId: String(row.requestItemId),
            requestType: String(row.requestType ?? "整机"),
            taxExcludedUnitPrice,
            taxSurcharge,
            unitPrice: importedUnitPrice || taxExcludedUnitPrice + taxSurcharge,
            hardwareCoefficient: Number(row.hardwareCoefficient || 1),
            softwareCoefficient: Number(row.softwareCoefficient || 0),
          };
        }),
      }),
    );
  }
}

function buildInstanceContractOperations(rows: Row[], operations: ImportPreview["operations"]) {
  operations.instanceContracts = rows.map((row) => ({
    id: buildInstanceContractId(row),
    ...row,
  }));
}

function buildBillingLedgerOperations(rows: Row[], operations: ImportPreview["operations"]) {
  operations.billingLedgers = rows.map((row) => ({
    ...row,
    ledgerId: String(row.ledgerId || `BIL-${row.purchaseOrderItemId || randomUUID().slice(0, 8)}`),
    quantity: Number(row.quantity ?? 0),
    actualUnitPrice: Number(row.actualUnitPrice ?? 0),
    first24MonthPrice: Number(row.first24MonthPrice ?? 0),
    next36MonthPrice: Number(row.next36MonthPrice ?? 0),
    startMonth: firstBillingMonth(String(row.startMonth)),
    status: row.status || "核销中",
  }));

  operations.monthlyBillingWriteOffs = operations.billingLedgers.flatMap((ledger) =>
    buildMonthlyBillingRows(ledger as any),
  );
}

function buildPrepaymentContractOperations(rows: Row[], operations: ImportPreview["operations"]) {
  const grouped = groupBy(rows, (row) => String(row.contractNo));

  for (const [contractNo, groupRows] of grouped) {
    const first = groupRows[0];
    const lines = groupRows.map((row, index) => {
      const lineType = String(row.lineType || "instance") === "fee" ? "fee" : "instance";
      const contractTotalAmount = Number(row.contractTotalAmount ?? 0);
      const contractUnitPrice = Number(row.contractUnitPrice || contractTotalAmount / Math.max(1, Number(row.quantity || 1)));

      return {
        id: String(row.id || `PPCI-${contractNo}-${String(index + 1).padStart(3, "0")}`),
        contractNo,
        lineType,
        requestType: lineType === "fee" ? String(row.requestType ?? "") : String(row.requestType ?? "整机"),
        purchaseOrderItemId: String(row.purchaseOrderItemId ?? ""),
        requestItemId: String(row.requestItemId ?? ""),
        countryCode: String(row.countryCode ?? ""),
        batchName: String(row.batchName ?? ""),
        requestNo: String(row.requestNo ?? ""),
        poNo: String(row.poNo ?? ""),
        deviceCode: String(row.deviceCode ?? ""),
        modelCode: String(row.modelCode ?? ""),
        nameEn: String(row.nameEn ?? ""),
        supplierId: String(row.supplierId ?? ""),
        undertakingUnitId: String(row.undertakingUnitId ?? ""),
        quantity: Number(row.quantity ?? 0),
        actualCurrency: String(row.actualCurrency ?? ""),
        actualUnitPrice: Number(row.actualUnitPrice ?? 0),
        actualTotalAmount: Number(row.actualTotalAmount ?? 0),
        contractCurrency: String(row.contractCurrency ?? first.currency ?? ""),
        contractUnitPrice,
        contractTotalAmount,
        writeOffStartMonth: firstPrepaymentMonth(String(row.writeOffStartMonth)),
        feeName: String(row.feeName ?? ""),
        feeDescription: String(row.feeDescription ?? ""),
        prepaymentAmount: contractTotalAmount,
        currency: String(row.contractCurrency ?? first.currency ?? ""),
        usdRate: null,
        paymentDate: null,
      };
    });
    const totalAmount = roundMoney(lines.reduce((total, line) => total + Number(line.contractTotalAmount ?? 0), 0));
    const status = "草稿";

    operations.prepaymentContracts.push({
      contractNo,
      status,
      currency: first.currency,
      effectiveDate: firstPrepaymentMonth(String(first.effectiveDate)),
      totalAmount,
      confirmedAt: null,
    });
    operations.prepaymentContractItems.push(...lines);
  }
}

function normalizeRow(target: ImportTarget, row: Row) {
  return Object.fromEntries(
    target.columns.map((column) => {
      const value = row[column.key] ?? row[column.label] ?? "";
      if (column.type === "number") return [column.key, value === "" || value == null ? "" : Number(value)];
      if (column.type === "date") return [column.key, normalizeImportDateValue(value)];
      return [column.key, typeof value === "string" ? value.trim() : value];
    }),
  );
}

function normalizeImportDateValue(value: unknown) {
  if (value === "" || value === undefined || value === null) return "";
  if (value instanceof Date) {
    return formatDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

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
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return text;
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validateRow(target: ImportTarget, row: Row) {
  for (const column of target.columns) {
    if (column.required && isBlank(row[column.key])) {
      return `${column.label}不能为空`;
    }
    if (column.type === "number" && !isBlank(row[column.key]) && Number.isNaN(Number(row[column.key]))) {
      return `${column.label}必须是数字`;
    }
  }

  if (target.key === "request-orders" && !isRequestType(row.requestType)) {
    return "需求类型只能选择整机或备件";
  }

  if (target.key === "prepayment-contracts" && String(row.lineType || "instance") !== "fee") {
    for (const [key, label] of [["requestNo", "需求单号"], ["poNo", "PO订单号"], ["deviceCode", "实例编码"]] as const) {
      if (isBlank(row[key])) return `${label}不能为空（实例行）`;
    }
  }

  if (["purchase-orders", "instance-contracts", "billing-ledgers", "prepayment-contracts"].includes(target.key)) {
    const currencyKeys = ["currency", "actualCurrency", "contractCurrency"].filter((key) => !isBlank(row[key]));
    const invalidCurrencyKey = currencyKeys.find((key) => !PURCHASE_CURRENCY_OPTIONS.includes(String(row[key])));
    if (invalidCurrencyKey) return `${invalidCurrencyKey}必须是：${PURCHASE_CURRENCY_OPTIONS.join("/")}`;
  }

  return "";
}

function normalizePurchaseRequestItemId(targetKey: ImportTargetKey, row: Row, requestItems: Row[]) {
  if (targetKey !== "purchase-orders") return "";
  if (!isBlank(row.requestItemId)) {
    const matched = requestItems.find((item) => String(item.id ?? "").trim() === String(row.requestItemId).trim());
    if (matched) row.requestType = String(matched.requestType ?? "整机");
    return "";
  }
  if (isBlank(row.deviceCode)) return "需求明细ID或产品编码必须填写一项";

  const requestNo = String(row.requestNo ?? "").trim();
  const deviceCode = String(row.deviceCode ?? "").trim();
  const matches = requestItems.filter(
    (item) => String(item.requestNo ?? "").trim() === requestNo && String(item.deviceCode ?? "").trim() === deviceCode,
  );

  if (matches.length === 1) {
    row.requestItemId = matches[0].id;
    row.requestType = String(matches[0].requestType ?? "整机");
    return "";
  }

  if (matches.length > 1) {
    return `产品编码 ${deviceCode} 在需求单 ${requestNo} 下匹配到多条需求明细，请改填需求明细ID`;
  }

  return `产品编码 ${deviceCode} 在需求单 ${requestNo} 下未找到对应需求明细`;
}

function normalizeInstanceContractModel(targetKey: ImportTargetKey, row: Row, instanceModels: Row[]) {
  if (targetKey !== "instance-contracts") return "";
  if (!isBlank(row.modelCode) && !isBlank(row.instanceModelEn)) return "";

  const deviceCode = String(row.deviceCode ?? "").trim();
  const model = instanceModels.find((item) => String(item.deviceCode ?? "").trim() === deviceCode);
  if (!model) return `设备编码 ${deviceCode} 未匹配到实例型号，请先维护实例型号主数据或补充机型和实例型号英文`;

  if (isBlank(row.modelCode)) row.modelCode = String(model.modelCode ?? "");
  if (isBlank(row.instanceModelEn)) row.instanceModelEn = String(model.nameEn ?? "");
  if (isBlank(row.modelCode) || isBlank(row.instanceModelEn)) {
    return `设备编码 ${deviceCode} 对应的实例型号资料不完整`;
  }
  return "";
}

function normalizeBillingPurchaseLine(targetKey: ImportTargetKey, row: Row, purchaseLines: Row[]) {
  if (targetKey !== "billing-ledgers") return "";
  if (!isBlank(row.purchaseOrderItemId)) {
    const line = purchaseLines.find(
      (item) => String(item.purchaseOrderItemId ?? "").trim() === String(row.purchaseOrderItemId).trim(),
    );
    if (line) applyBillingPurchaseLine(row, line);
    return "";
  }

  if (isBlank(row.requestNo) || isBlank(row.poNo) || isBlank(row.deviceCode)) {
    return "采购明细ID为空时，需求单号、PO订单号、实例编码必须填写";
  }

  const requestNo = String(row.requestNo ?? "").trim();
  const poNo = String(row.poNo ?? "").trim();
  const deviceCode = String(row.deviceCode ?? "").trim();
  const matches = purchaseLines.filter(
    (item) =>
      String(item.requestNo ?? "").trim() === requestNo &&
      String(item.poNo ?? "").trim() === poNo &&
      String(item.deviceCode ?? "").trim() === deviceCode,
  );

  if (matches.length === 1) {
    applyBillingPurchaseLine(row, matches[0]);
    return "";
  }

  if (matches.length > 1) {
    return `需求单号 ${requestNo}、PO订单号 ${poNo}、实例编码 ${deviceCode} 匹配到多条采购明细，请填写采购明细ID`;
  }

  return `未找到匹配的采购明细：${requestNo}/${poNo}/${deviceCode}`;
}

function normalizeBillingRequestType(targetKey: ImportTargetKey, row: Row) {
  if (targetKey !== "billing-ledgers") return "";
  if (isBlank(row.requestType)) row.requestType = "整机";
  return String(row.requestType).trim() === "备件"
    ? "备件不参与月账单台账和月账单明细生成，请改用预付款合同导入"
    : "";
}

function applyBillingPurchaseLine(row: Row, line: Row) {
  const fields = [
    "purchaseOrderItemId",
    "countryCode",
    "batchName",
    "requestNo",
    "poNo",
    "deviceCode",
    "requestType",
    "modelCode",
    "nameEn",
    "supplierId",
    "undertakingUnitId",
    "quantity",
    "actualCurrency",
    "actualUnitPrice",
  ];

  for (const field of fields) {
    if (isBlank(row[field]) && !isBlank(line[field])) {
      row[field] = line[field];
    }
  }
  if (!isBlank(line.requestType)) row.requestType = line.requestType;
}

function normalizeBillingInstanceContract(targetKey: ImportTargetKey, row: Row, instanceContracts: Row[]) {
  if (targetKey !== "billing-ledgers") return "";

  const contractNo = String(row.instanceContractNo ?? "").trim();
  const countryCode = String(row.countryCode ?? "").trim();
  const deviceCode = String(row.deviceCode ?? "").trim();
  const matches = instanceContracts.filter(
    (contract) =>
      String(contract.contractNo ?? "").trim() === contractNo &&
      String(contract.countryCode ?? "").trim() === countryCode &&
      String(contract.deviceCode ?? "").trim() === deviceCode,
  );

  if (matches.length !== 1) {
    return matches.length
      ? `实例合同 ${contractNo} 在国家 ${countryCode}、实例编码 ${deviceCode} 下匹配到多条记录`
      : `未找到实例合同 ${contractNo} 对应的国家 ${countryCode}、实例编码 ${deviceCode} 价格`;
  }

  const contract = matches[0];
  row.contractCurrency = contract.currency;
  row.first24MonthPrice = contract.first24MonthPriceUSD;
  row.next36MonthPrice = contract.next36MonthPriceUSD;
  if (isBlank(row.requestType)) row.requestType = "整机";
  return "";
}

function normalizePrepaymentPurchaseLine(targetKey: ImportTargetKey, row: Row, purchaseLines: Row[]) {
  if (targetKey !== "prepayment-contracts") return "";
  const lineType = String(row.lineType || "instance") === "fee" ? "fee" : "instance";
  if (lineType === "fee") return "";

  if (!isBlank(row.purchaseOrderItemId)) {
    const line = purchaseLines.find(
      (item) => String(item.purchaseOrderItemId ?? "").trim() === String(row.purchaseOrderItemId).trim(),
    );
    if (line) applyPrepaymentPurchaseLine(row, line);
    return "";
  }

  if (isBlank(row.requestNo) || isBlank(row.poNo) || isBlank(row.deviceCode)) {
    return "采购明细ID为空时，实例行必须填写需求单号、PO订单号、实例编码";
  }

  const requestNo = String(row.requestNo ?? "").trim();
  const poNo = String(row.poNo ?? "").trim();
  const deviceCode = String(row.deviceCode ?? "").trim();
  const matches = purchaseLines.filter(
    (item) =>
      String(item.requestNo ?? "").trim() === requestNo &&
      String(item.poNo ?? "").trim() === poNo &&
      String(item.deviceCode ?? "").trim() === deviceCode,
  );

  if (matches.length === 1) {
    applyPrepaymentPurchaseLine(row, matches[0]);
    return "";
  }

  if (matches.length > 1) {
    return `需求单号 ${requestNo}、PO订单号 ${poNo}、实例编码 ${deviceCode} 匹配到多条采购明细，请填写采购明细ID`;
  }

  return `未找到匹配的采购明细：${requestNo}/${poNo}/${deviceCode}`;
}

function applyPrepaymentPurchaseLine(row: Row, line: Row) {
  const fields = [
    "purchaseOrderItemId",
    "requestItemId",
    "countryCode",
    "batchName",
    "requestNo",
    "poNo",
    "deviceCode",
    "modelCode",
    "nameEn",
    "supplierId",
    "undertakingUnitId",
    "quantity",
    "actualCurrency",
    "actualUnitPrice",
    "actualTotalAmount",
    "requestType",
  ];

  for (const field of fields) {
    if (isBlank(row[field]) && !isBlank(line[field])) {
      row[field] = line[field];
    }
  }
  if (!isBlank(line.requestType)) row.requestType = line.requestType;
}

function getRequiredTarget(targetKey: ImportTargetKey) {
  const target = getImportTarget(targetKey);
  if (!target) throw new Error(`Unknown import target: ${targetKey}`);
  return target;
}

function getPrimaryKeyText(targetKey: ImportTargetKey, row: Row) {
  if (targetKey === "request-orders") return String(row.requestNo ?? "");
  if (targetKey === "purchase-orders") return String(row.poNo ?? "");
  if (targetKey === "billing-ledgers") return String(row.ledgerId ?? "");
  if (targetKey === "prepayment-contracts") return String(row.contractNo ?? "");
  return [row.contractNo, row.countryCode, row.deviceCode].filter(Boolean).join("/");
}

function buildInstanceContractId(row: Row) {
  return String(row.id || `IC-${row.contractNo}-${row.countryCode}-${row.deviceCode}-${randomUUID().slice(0, 8)}`);
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function isBlank(value: unknown) {
  return value === undefined || value === null || String(value).trim() === "";
}
