import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import ExcelJS from "exceljs";
import { closeDb, queryRows, type Row } from "../src/lib/db";

loadEnvConfig(process.cwd());

const workbookPath = "C:/Users/wgx/Desktop/管理费/管理服务费.xlsx";
const outputPath = path.resolve("outputs/management-fee-comparison-20261126/source-data.json");

type AttachmentType = "contract" | "jc" | "spare";

type AttachmentRow = {
  rowNumber: number;
  type: AttachmentType;
  countryCode: string;
  sequence: string;
  deviceCode: string;
  modelCode: string;
  quantity: number;
  contractCurrency: "USD";
  procurementUnitUsd: number | null;
  procurementTotalUsd: number | null;
  first24UnitUsd: number | null;
  next36UnitUsd: number | null;
  contractIncludingTaxUsd: number | null;
  contractExcludingTaxUsd: number | null;
  managementFeeTotalUsd: number | null;
  monthlyFirst24Usd: number | null;
  monthlyNext36Usd: number | null;
  startMonth: string;
};

type SystemLedger = Row & {
  ledgerId: string;
  countryCode: string;
  batchName: string;
  requestNo: string;
  poNo: string;
  deviceCode: string;
  modelCode: string;
  nameEn: string;
  quantity: number;
  contractCurrency: string;
  procurementCurrency: string;
  reportingCurrency: string;
  exchangeRate: number;
  procurementToContractRate: number;
  first24MonthPrice: number;
  next36MonthPrice: number;
  procurementTaxExcludedUnitPrice: number;
  procurementTaxSurcharge: number;
  procurementCostContract: number;
  procurementCostUsd: number;
  contractRevenueIncludingTax: number;
  contractRevenueExcludingTax: number;
  contractRevenueIncludingTaxUsd: number;
  contractRevenueExcludingTaxUsd: number;
  internalServiceFeeTotal: number;
  internalServiceFeeReportingTotal: number;
  startMonth: string;
  initialStatus: string;
};

function valueOf(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object" && "result" in value) return value.result;
  if (value && typeof value === "object" && "text" in value) return value.text;
  return value;
}

function textOf(cell: ExcelJS.Cell) {
  return String(valueOf(cell) ?? "").trim();
}

function numberOf(cell: ExcelJS.Cell) {
  const value = Number(valueOf(cell));
  return Number.isFinite(value) ? value : null;
}

function monthOf(cell: ExcelJS.Cell) {
  const value = valueOf(cell);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (typeof value === "number") {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const match = /^(\d{4})[-/.年](\d{1,2})/.exec(String(value ?? "").trim());
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-01` : "";
}

function rounded(value: number | null, precision = 2) {
  if (value == null) return null;
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

async function readAttachment() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("附件中没有工作表");

  const rows: AttachmentRow[] = [];
  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sequence = textOf(row.getCell(3));
    if (!sequence) continue;
    const type: AttachmentType = sequence.includes("备件") ? "spare" : sequence.endsWith("JC") ? "jc" : "contract";
    const quantity = numberOf(row.getCell(11)) ?? 0;
    const procurementUnitUsd = numberOf(row.getCell(15));
    rows.push({
      rowNumber,
      type,
      countryCode: sequence.slice(0, 2).toUpperCase(),
      sequence,
      deviceCode: textOf(row.getCell(9)),
      modelCode: textOf(row.getCell(10)),
      quantity,
      contractCurrency: "USD",
      procurementUnitUsd,
      procurementTotalUsd: procurementUnitUsd == null ? null : rounded(procurementUnitUsd * quantity),
      first24UnitUsd: numberOf(row.getCell(26)),
      next36UnitUsd: numberOf(row.getCell(27)),
      contractIncludingTaxUsd: numberOf(row.getCell(39)),
      contractExcludingTaxUsd: numberOf(row.getCell(40)),
      managementFeeTotalUsd: numberOf(row.getCell(41)),
      monthlyFirst24Usd: numberOf(row.getCell(42)),
      monthlyNext36Usd: numberOf(row.getCell(43)),
      startMonth: monthOf(row.getCell(45)),
    });
  }
  return rows;
}

async function readSystemLedgers() {
  return queryRows<SystemLedger>(`
    SELECT
      b.ledgerId,
      b.countryCode,
      b.batchName,
      b.requestNo,
      b.poNo,
      b.deviceCode,
      b.modelCode,
      b.nameEn,
      b.quantity,
      UPPER(COALESCE(b.contractCurrency, '')) AS contractCurrency,
      UPPER(COALESCE(NULLIF(i.procurementCurrency, ''), p.currency, b.contractCurrency, '')) AS procurementCurrency,
      UPPER(COALESCE(NULLIF(i.reportingCurrency, ''), 'USD')) AS reportingCurrency,
      COALESCE(i.exchangeRate, 1) AS exchangeRate,
      COALESCE(i.procurementToContractRate, 1) AS procurementToContractRate,
      COALESCE(b.first24MonthPrice, 0) AS first24MonthPrice,
      COALESCE(b.next36MonthPrice, 0) AS next36MonthPrice,
      COALESCE(i.procurementTaxExcludedUnitPrice, p.taxExcludedUnitPrice, b.taxExcludedUnitPrice, 0) AS procurementTaxExcludedUnitPrice,
      COALESCE(i.procurementTaxSurcharge, p.taxSurcharge, b.taxSurcharge, 0) AS procurementTaxSurcharge,
      COALESCE(i.procurementCost, 0) AS procurementCostContract,
      ROUND(COALESCE(b.quantity, 0) * (
        COALESCE(i.procurementTaxExcludedUnitPrice, p.taxExcludedUnitPrice, b.taxExcludedUnitPrice, 0)
        + COALESCE(i.procurementTaxSurcharge, p.taxSurcharge, b.taxSurcharge, 0)
      ), 2) AS procurementCostUsd,
      COALESCE(i.contractRevenueIncludingTax, 0) AS contractRevenueIncludingTax,
      COALESCE(i.contractRevenueExcludingTax, 0) AS contractRevenueExcludingTax,
      ROUND(COALESCE(i.contractRevenueIncludingTax, 0) / NULLIF(COALESCE(i.exchangeRate, 1), 0), 2) AS contractRevenueIncludingTaxUsd,
      ROUND(COALESCE(i.contractRevenueExcludingTax, 0) / NULLIF(COALESCE(i.exchangeRate, 1), 0), 2) AS contractRevenueExcludingTaxUsd,
      COALESCE(i.internalServiceFeeTotal, 0) AS internalServiceFeeTotal,
      COALESCE(i.internalServiceFeeReportingTotal, 0) AS internalServiceFeeReportingTotal,
      DATE_FORMAT(b.startMonth, '%Y-%m-%d') AS startMonth,
      COALESCE(i.status, '未初始化') AS initialStatus
    FROM billinginstanceledgers b
    LEFT JOIN internalserviceledgers i ON i.ledgerId = b.ledgerId
    LEFT JOIN purchaseorderitems p ON p.id = b.purchaseOrderItemId
    ORDER BY b.countryCode, b.batchName, b.deviceCode, b.modelCode
  `);
}

function key(batchName: unknown, deviceCode: unknown) {
  return `${String(batchName ?? "").trim()}|${String(deviceCode ?? "").trim()}`;
}

function shapeKey(deviceCode: unknown, modelCode: unknown, quantity: unknown) {
  return `${String(deviceCode ?? "").trim()}|${String(modelCode ?? "").trim()}|${Number(quantity ?? 0)}`;
}

function startKey(deviceCode: unknown, quantity: unknown, startMonth: unknown) {
  return `${String(deviceCode ?? "").trim()}|${Number(quantity ?? 0)}|${String(startMonth ?? "").slice(0, 7)}`;
}

function signature(row: AttachmentRow) {
  return [
    row.first24UnitUsd,
    row.next36UnitUsd,
    row.contractIncludingTaxUsd,
    row.startMonth,
  ].map((value) => value == null ? "" : Number(value).toFixed(6)).join("|");
}

function uniqueCandidate(rows: AttachmentRow[]) {
  if (!rows.length) return null;
  return new Set(rows.map(signature)).size === 1 ? rows[0] : null;
}

async function main() {
  const [attachmentRows, systemLedgers] = await Promise.all([readAttachment(), readSystemLedgers()]);
  const contracts = attachmentRows.filter((row) => row.type === "contract");
  const exactGroups = new Map<string, AttachmentRow[]>();
  const shapeGroups = new Map<string, AttachmentRow[]>();
  const startGroups = new Map<string, AttachmentRow[]>();

  for (const row of contracts) {
    const exact = key(row.sequence, row.deviceCode);
    const shape = shapeKey(row.deviceCode, row.modelCode, row.quantity);
    const start = startKey(row.deviceCode, row.quantity, row.startMonth);
    exactGroups.set(exact, [...(exactGroups.get(exact) ?? []), row]);
    shapeGroups.set(shape, [...(shapeGroups.get(shape) ?? []), row]);
    startGroups.set(start, [...(startGroups.get(start) ?? []), row]);
  }

  const matches = new Map<string, {
    method: "批次+实例编码" | "实例编码+型号+数量" | "实例编码+数量+开始月";
    rows: AttachmentRow[];
  }>();
  for (const ledger of systemLedgers) {
    const exactRows = exactGroups.get(key(ledger.batchName, ledger.deviceCode)) ?? [];
    if (exactRows.length) {
      matches.set(ledger.ledgerId, {
        method: "批次+实例编码",
        rows: exactRows,
      });
      continue;
    }
    const shape = uniqueCandidate(shapeGroups.get(shapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity)) ?? []);
    if (shape) {
      matches.set(ledger.ledgerId, {
        method: "实例编码+型号+数量",
        rows: shapeGroups.get(shapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity)) ?? [],
      });
      continue;
    }
    const start = uniqueCandidate(startGroups.get(startKey(ledger.deviceCode, ledger.quantity, ledger.startMonth)) ?? []);
    if (start) {
      matches.set(ledger.ledgerId, {
        method: "实例编码+数量+开始月",
        rows: startGroups.get(startKey(ledger.deviceCode, ledger.quantity, ledger.startMonth)) ?? [],
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    sources: {
      attachment: workbookPath,
      databaseTables: [
        "merge_power_billinginstanceledgers",
        "merge_power_internalserviceledgers",
        "merge_power_purchaseorderitems",
      ],
    },
    counts: {
      systemLedgers: systemLedgers.length,
      attachmentRows: attachmentRows.length,
      attachmentContracts: contracts.length,
      attachmentJc: attachmentRows.filter((row) => row.type === "jc").length,
      attachmentSpares: attachmentRows.filter((row) => row.type === "spare").length,
      matchedSystemLedgers: matches.size,
      unmatchedSystemLedgers: systemLedgers.length - matches.size,
    },
    systemLedgers,
    attachmentRows,
    matches: Object.fromEntries([...matches].map(([ledgerId, match]) => [ledgerId, {
      method: match.method,
      rowNumbers: match.rows.map((row) => row.rowNumber),
      selectedRow: match.rows.at(-1) ?? null,
      candidateCount: match.rows.length,
    }])),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
  console.log(JSON.stringify({
    outputPath,
    counts: result.counts,
    matchMethods: Object.values(result.matches).reduce<Record<string, number>>((counts, match) => {
      counts[match.method] = (counts[match.method] ?? 0) + 1;
      return counts;
    }, {}),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
