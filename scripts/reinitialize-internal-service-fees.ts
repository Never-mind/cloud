import { loadEnvConfig } from "@next/env";
import ExcelJS from "exceljs";
import { closeDb, execute as dbExecute, queryRows as dbQuery, type Row } from "../src/lib/db";
import { currentPeriodMonth, resolveExchangeRate } from "../src/lib/exchange-rate-service";
import { feeExecute, feeQuery, withInternalFeeTransaction } from "../src/lib/internal-service-fee-db";
import { initializeJcAdjustments } from "../src/lib/internal-service-fee-jc-service";
import { regenerateInternalServiceLedger } from "../src/lib/internal-service-fee-service";
import { rebuildBillingMonthlyRows } from "../src/lib/billing-service";
import { internalServiceSpareBusinessKey } from "../src/lib/internal-service-fee-spare";

loadEnvConfig(process.cwd());

const defaultWorkbook = "C:/Users/wgx/Desktop/管理费/管理服务费.xlsx";
const systemActor = "system@management-fee-reinit";

type Ledger = Row & {
  ledgerId: string;
  batchName: string;
  deviceCode: string;
  modelCode: string;
  quantity: number;
  contractCurrency: string;
  purchaseCurrency: string;
  first24MonthPrice: number;
  next36MonthPrice: number;
  selfCalculatedUnitPrice: number;
};

type WorkbookContract = {
  first24Price: number;
  next36Price: number;
  totalReporting: number;
  startMonth: string;
};

type WorkbookSpare = {
  rowNumber: number;
  sequence: string;
  countryCode: string;
  quantity: number;
  startMonth: string;
  totalReporting: number;
  procurementTotalReporting: number | null;
  contractExcludingTaxReporting: number | null;
  first24Monthly: number;
  next36Monthly: number;
};

type AdjustmentItem = Row & {
  id: string;
  adjustmentNo: string;
  ledgerId: string;
  batchName: string;
  deviceCode: string;
  modelCode: string;
  quantity: number;
  originalPrice: number;
  adjustedPrice: number;
};

type WorkbookPricing = {
  rates: Map<string, number>;
  contracts: Map<string, WorkbookContract>;
  contractsByShape: Map<string, WorkbookContract>;
  contractsByDeviceStart: Map<string, WorkbookContract>;
  duplicateContractKeys: Set<string>;
  duplicateContractShapeKeys: Set<string>;
  duplicateContractDeviceStartKeys: Set<string>;
  spares: WorkbookSpare[];
  approvedReporting: Map<string, number>;
  approvedReportingByShape: Map<string, number>;
  approvedReportingByBatchDevice: Map<string, number>;
  approvalShapes: Array<{
    batchName: string;
    deviceCode: string;
    quantity: number;
    originalPrice: number;
    adjustedPrice: number;
    approvedReporting: number;
  }>;
  duplicateRateKeys: Set<string>;
  duplicateApprovalKeys: Set<string>;
  duplicateApprovalShapeKeys: Set<string>;
  duplicateApprovalBatchDeviceKeys: Set<string>;
};

function argValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? "";
}

function exactKey(batchName: unknown, deviceCode: unknown, modelCode?: unknown) {
  return [batchName, deviceCode, modelCode].map((value) => String(value ?? "").trim()).join("|");
}

function batchDeviceKey(batchName: unknown, deviceCode: unknown) {
  return `${String(batchName ?? "").trim()}|${String(deviceCode ?? "").trim()}`;
}

function deviceShapeKey(deviceCode: unknown, modelCode: unknown, quantity: unknown) {
  return `${String(deviceCode ?? "").trim()}|${String(modelCode ?? "").trim()}|${Number(quantity ?? 0)}`;
}

function deviceStartKey(deviceCode: unknown, quantity: unknown, startMonth: unknown) {
  return `${String(deviceCode ?? "").trim()}|${Number(quantity ?? 0)}|${String(startMonth ?? "").slice(0, 7)}`;
}

function approvalShapeKey(batchName: unknown, deviceCode: unknown, quantity: unknown, originalPrice: unknown, adjustedPrice: unknown) {
  const priceKey = (value: unknown) => Number(value ?? 0).toFixed(2);
  return `${String(batchName ?? "").trim()}|${String(deviceCode ?? "").trim()}|${Number(quantity ?? 0)}|${priceKey(originalPrice)}|${priceKey(adjustedPrice)}`;
}

function workbookText(row: ExcelJS.Row, column: number) {
  const value = row.getCell(column).value;
  if (value && typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  if (value && typeof value === "object" && "text" in value) return String(value.text ?? "").trim();
  return String(value ?? "").trim();
}

function workbookNumber(row: ExcelJS.Row, column: number) {
  const value = row.getCell(column).value;
  const resolved = value && typeof value === "object" && "result" in value ? value.result : value;
  const number = Number(resolved);
  return Number.isFinite(number) ? number : null;
}

function workbookMonth(row: ExcelJS.Row, column: number) {
  const cell = row.getCell(column).value;
  const value = cell && typeof cell === "object" && "result" in cell ? cell.result : cell;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const match = /^(\d{4})[-/.](\d{1,2})/.exec(String(value ?? "").trim());
  if (!match) return "";
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${String(month).padStart(2, "0")}-01` : "";
}

function roundPrice(value: number) {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function addMonths(startMonth: string, offset: number) {
  const [year, month] = startMonth.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function readWorkbookPricing(path: string, ledgers: Ledger[]): Promise<WorkbookPricing> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("附件中没有工作表");

  const systemTotals = new Map<string, { total: number; quantity: number }>();
  const systemTotalsByShape = new Map<string, { total: number; quantity: number; matchCount: number }>();
  for (const ledger of ledgers) {
    if (String(ledger.contractCurrency).toUpperCase() !== "CNY" || String(ledger.purchaseCurrency).toUpperCase() !== "USD") continue;
    systemTotals.set(batchDeviceKey(ledger.batchName, ledger.deviceCode), {
      total: Number(ledger.quantity) * (Number(ledger.first24MonthPrice) * 24 + Number(ledger.next36MonthPrice) * 36),
      quantity: Number(ledger.quantity),
    });
    const shapeKey = deviceShapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity);
    const existing = systemTotalsByShape.get(shapeKey);
    systemTotalsByShape.set(shapeKey, {
      total: existing?.total ?? Number(ledger.quantity) * (Number(ledger.first24MonthPrice) * 24 + Number(ledger.next36MonthPrice) * 36),
      quantity: Number(ledger.quantity),
      matchCount: (existing?.matchCount ?? 0) + 1,
    });
  }

  const rates = new Map<string, number>();
  const duplicateRateKeys = new Set<string>();
  const contracts = new Map<string, WorkbookContract>();
  const contractsByShape = new Map<string, WorkbookContract>();
  const contractsByDeviceStart = new Map<string, WorkbookContract>();
  const duplicateContractKeys = new Set<string>();
  const duplicateContractShapeKeys = new Set<string>();
  const duplicateContractDeviceStartKeys = new Set<string>();
  const spares: WorkbookSpare[] = [];
  const approvals = new Map<string, number>();
  const approvalsByShape = new Map<string, number>();
  const approvalsByBatchDevice = new Map<string, number>();
  const approvalShapes: WorkbookPricing["approvalShapes"] = [];
  const duplicateApprovalKeys = new Set<string>();
  const duplicateApprovalShapeKeys = new Set<string>();
  const duplicateApprovalBatchDeviceKeys = new Set<string>();

  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const sequence = workbookText(row, 3);
    if (!sequence) continue;
    const deviceCode = workbookText(row, 9);
    const modelCode = workbookText(row, 10);

    if (sequence.includes("备件")) {
      const startMonth = workbookMonth(row, 45);
      const totalReporting = workbookNumber(row, 41);
      const procurementTotalReporting = workbookNumber(row, 15) == null
        ? null
        : Number(workbookNumber(row, 15)) * Number(workbookNumber(row, 11) ?? 1);
      const contractExcludingTaxReporting = workbookNumber(row, 40);
      const first24Monthly = workbookNumber(row, 42);
      const next36Monthly = workbookNumber(row, 43);
      if (startMonth && totalReporting != null && first24Monthly != null && next36Monthly != null) {
        spares.push({
          rowNumber,
          sequence,
          countryCode: sequence.slice(0, 2).toUpperCase(),
          quantity: Number(workbookNumber(row, 11) ?? 1),
          startMonth,
          totalReporting,
          procurementTotalReporting,
          contractExcludingTaxReporting,
          first24Monthly,
          next36Monthly,
        });
      }
      continue;
    }

    if (sequence.endsWith("JC")) {
      const originalBatch = sequence.slice(0, -2);
      const approved = workbookNumber(row, 41);
      if (approved == null) continue;
      const key = exactKey(originalBatch, deviceCode, modelCode);
      const batchDevice = batchDeviceKey(originalBatch, deviceCode);
      const shapeKey = approvalShapeKey(originalBatch, deviceCode, workbookNumber(row, 11), workbookNumber(row, 25), workbookNumber(row, 26));
      if (approvals.has(key) && approvals.get(key) !== approved) duplicateApprovalKeys.add(key);
      approvals.set(key, approved);
      if (approvalsByShape.has(shapeKey) && approvalsByShape.get(shapeKey) !== approved) duplicateApprovalShapeKeys.add(shapeKey);
      approvalsByShape.set(shapeKey, approved);
      if (approvalsByBatchDevice.has(batchDevice) && approvalsByBatchDevice.get(batchDevice) !== approved) duplicateApprovalBatchDeviceKeys.add(batchDevice);
      approvalsByBatchDevice.set(batchDevice, approved);
      approvalShapes.push({
        batchName: String(originalBatch).trim(),
        deviceCode,
        quantity: Number(workbookNumber(row, 11) ?? 0),
        originalPrice: Number(workbookNumber(row, 25) ?? 0),
        adjustedPrice: Number(workbookNumber(row, 26) ?? 0),
        approvedReporting: approved,
      });
      continue;
    }

    const key = batchDeviceKey(sequence, deviceCode);
    const quantity = workbookNumber(row, 11);
    const shapeKey = deviceShapeKey(deviceCode, modelCode, quantity);
    const first24Price = workbookNumber(row, 26);
    const next36Price = workbookNumber(row, 27);
    const totalReporting = workbookNumber(row, 39);
    const startMonth = workbookMonth(row, 45);
    if (first24Price != null && next36Price != null && totalReporting != null && quantity != null && startMonth) {
      const contract = { first24Price, next36Price, totalReporting, startMonth };
      const existing = contracts.get(key);
      if (existing && JSON.stringify(existing) !== JSON.stringify(contract)) duplicateContractKeys.add(key);
      contracts.set(key, contract);
      const existingShape = contractsByShape.get(shapeKey);
      if (existingShape && JSON.stringify(existingShape) !== JSON.stringify(contract)) duplicateContractShapeKeys.add(shapeKey);
      contractsByShape.set(shapeKey, contract);
      const deviceStartKeyValue = deviceStartKey(deviceCode, quantity, startMonth);
      const existingDeviceStart = contractsByDeviceStart.get(deviceStartKeyValue);
      if (existingDeviceStart && JSON.stringify(existingDeviceStart) !== JSON.stringify(contract)) duplicateContractDeviceStartKeys.add(deviceStartKeyValue);
      contractsByDeviceStart.set(deviceStartKeyValue, contract);
    }
    const shapeSystem = systemTotalsByShape.get(shapeKey);
    const system = systemTotals.get(key)
      ?? (shapeSystem?.matchCount === 1 ? shapeSystem : undefined);
    const workbookTotalUsd = workbookNumber(row, 39);
    if (!system || workbookTotalUsd == null || workbookTotalUsd <= 0) continue;
    if (quantity != null && quantity !== system.quantity) continue;
    const rate = system.total / workbookTotalUsd;
    if (!Number.isFinite(rate) || rate <= 0) continue;
    if (rates.has(key)) duplicateRateKeys.add(key);
    rates.set(key, Math.round(rate * 10_000) / 10_000);
    rates.set(shapeKey, Math.round(rate * 10_000) / 10_000);
  }

  return {
    rates,
    contracts,
    contractsByShape,
    contractsByDeviceStart,
    duplicateContractKeys,
    duplicateContractShapeKeys,
    duplicateContractDeviceStartKeys,
    spares,
    approvedReporting: approvals,
    approvedReportingByShape: approvalsByShape,
    approvedReportingByBatchDevice: approvalsByBatchDevice,
    approvalShapes,
    duplicateRateKeys,
    duplicateApprovalKeys,
    duplicateApprovalShapeKeys,
    duplicateApprovalBatchDeviceKeys,
  };
}

async function billingLedgers() {
  return dbQuery<Ledger>(`
    SELECT b.ledgerId,b.batchName,b.deviceCode,b.modelCode,b.quantity,b.contractCurrency,
      UPPER(COALESCE(NULLIF(p.currency,''),b.contractCurrency)) AS purchaseCurrency,
      b.first24MonthPrice,b.next36MonthPrice,b.selfCalculatedUnitPrice,
      DATE_FORMAT(b.startMonth,'%Y-%m-%d') AS startMonth
    FROM billinginstanceledgers b
    LEFT JOIN purchaseorderitems p ON p.id=b.purchaseOrderItemId
    ORDER BY b.batchName,b.deviceCode
  `);
}

async function adjustmentItems() {
  return dbQuery<AdjustmentItem>(`
    SELECT i.id,i.adjustmentNo,b.ledgerId,i.batchName,i.deviceCode,i.modelCode,
      b.quantity,b.first24MonthPrice AS originalPrice,i.adjustedFirst24MonthPrice AS adjustedPrice
    FROM billingadjustments a
    INNER JOIN billingadjustmentitems i ON i.adjustmentNo=a.adjustmentNo
    INNER JOIN billinginstanceledgers b
      ON b.countryCode=i.countryCode AND b.batchName=i.batchName AND b.deviceCode=i.deviceCode
      AND (b.requestNo=i.requestNo OR i.requestNo='')
    WHERE a.confirmedAt IS NOT NULL
    ORDER BY b.ledgerId,a.confirmedAt,i.adjustmentNo,i.id
  `);
}

async function preflight(apply: boolean) {
  const [safety] = await dbQuery<Row>(`
    SELECT
      (SELECT COUNT(*) FROM internalservicefeesnapshots) AS snapshots,
      (SELECT COUNT(*) FROM monthlyinternalservicefees WHERE archived=1) AS archivedRows,
      (SELECT COUNT(*) FROM internalservicefeeadjustments WHERE status='已确认') AS manualAdjustments
  `);
  if (apply && Number(safety.snapshots) > 0) throw new Error("存在管理费对账快照，禁止整批重建");
  if (apply && Number(safety.archivedRows) > 0) throw new Error("存在已对账月度明细，禁止整批重建");
  if (apply && Number(safety.manualAdjustments) > 0) throw new Error("存在已确认管理费区间调整，请先核对后再重建");
  return {
    snapshots: Number(safety.snapshots),
    archivedRows: Number(safety.archivedRows),
    manualAdjustments: Number(safety.manualAdjustments),
  };
}

function backupSuffix() {
  const stamp = currentPeriodMonth().replace("-", "") + "_" + Date.now().toString(36);
  return `bak_${stamp}`;
}

async function createBackup() {
  const suffix = backupSuffix();
  const tables = [
    "internalserviceledgers",
    "monthlyinternalservicefees",
    "internalservicefeeadjustments",
    "internalservicefeesnapshots",
    "internalservicefeesnapshotitems",
    "merge_power_internalservicejccomponents",
    "merge_power_internalservicejcmonths",
    "merge_power_internalservicejcaudit",
  ];
  const names: string[] = [];
  for (const table of tables) {
    if (!/^[a-z0-9_]+$/.test(table)) throw new Error(`不安全的备份表名：${table}`);
    const backup = `${table}_${suffix}`;
    await dbExecute(`CREATE TABLE \`${backup}\` LIKE \`${table}\``);
    await dbExecute(`INSERT INTO \`${backup}\` SELECT * FROM \`${table}\``);
    names.push(backup);
  }
  return { suffix, names };
}

async function resolveRates(ledgers: Ledger[], pricing: WorkbookPricing) {
  const resolved = new Map<string, {
    reportingCurrency: string;
    exchangeRate: number;
    procurementCurrency: string;
    procurementToContractRate: number;
  }>();
  const missing: string[] = [];
  for (const ledger of ledgers) {
    const sourceCurrency = String(ledger.contractCurrency).toUpperCase();
    const procurementCurrency = String(ledger.purchaseCurrency || sourceCurrency).toUpperCase();
    const reportingCurrency = procurementCurrency !== sourceCurrency ? procurementCurrency : sourceCurrency;
    let exchangeRate = 1;
    if (sourceCurrency !== reportingCurrency) {
      exchangeRate = pricing.rates.get(batchDeviceKey(ledger.batchName, ledger.deviceCode))
        ?? pricing.rates.get(deviceShapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity))
        ?? await resolveExchangeRate(String(ledger.startMonth), reportingCurrency, sourceCurrency)
        ?? 0;
    }
    let procurementToContractRate = 1;
    if (procurementCurrency !== sourceCurrency) {
      procurementToContractRate = pricing.rates.get(batchDeviceKey(ledger.batchName, ledger.deviceCode))
        ?? pricing.rates.get(deviceShapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity))
        ?? await resolveExchangeRate(String(ledger.startMonth), procurementCurrency, sourceCurrency)
        ?? 0;
    }
    if (exchangeRate <= 0 || procurementToContractRate <= 0) {
      missing.push(`${ledger.batchName}/${ledger.deviceCode}: ${procurementCurrency}→${sourceCurrency}, ${sourceCurrency}→${reportingCurrency}`);
      continue;
    }
    resolved.set(ledger.ledgerId, {
      reportingCurrency,
      exchangeRate,
      procurementCurrency,
      procurementToContractRate,
    });
  }
  if (missing.length) throw new Error(`缺少合同汇率，未执行重建：\n${missing.join("\n")}`);
  return resolved;
}

function contractPriceTargets(
  ledgers: Ledger[],
  pricing: WorkbookPricing,
  rates: Map<string, { exchangeRate: number }>,
) {
  const targets = new Map<string, { first24Price: number; next36Price: number; source: string }>();
  const missing: string[] = [];
  let adjustments = 0;
  for (const ledger of ledgers) {
    const rate = rates.get(ledger.ledgerId);
    if (!rate) continue;
    const key = batchDeviceKey(ledger.batchName, ledger.deviceCode);
    const shapeKey = deviceShapeKey(ledger.deviceCode, ledger.modelCode, ledger.quantity);
    const startKey = deviceStartKey(ledger.deviceCode, ledger.quantity, ledger.startMonth);
    const contract = pricing.contracts.get(key)
      ?? (pricing.duplicateContractShapeKeys.has(shapeKey) ? undefined : pricing.contractsByShape.get(shapeKey))
      ?? (pricing.duplicateContractDeviceStartKeys.has(startKey) ? undefined : pricing.contractsByDeviceStart.get(startKey));
    if (!contract) {
      missing.push(key);
      continue;
    }
    const first24Price = roundPrice(contract.first24Price * rate.exchangeRate);
    const next36Price = roundPrice(contract.next36Price * rate.exchangeRate);
    const changed = Math.abs(first24Price - Number(ledger.first24MonthPrice)) >= 0.005
      || Math.abs(next36Price - Number(ledger.next36MonthPrice)) >= 0.005;
    if (changed) adjustments += 1;
    targets.set(ledger.ledgerId, { first24Price, next36Price, source: contract.first24Price + "|" + contract.next36Price });
  }
  return { targets, missing, adjustments };
}

async function rebuildSpareLedgers(spares: WorkbookSpare[]) {
  let ledgerCount = 0;
  for (const spare of spares) {
    const ledgerId = `ISF-SPARE-${spare.countryCode}-${String(spare.rowNumber).padStart(3, "0")}`;
    const spareCode = `SPARE-${spare.countryCode}-${spare.rowNumber}`;
    const businessKey = internalServiceSpareBusinessKey({
      countryCode: spare.countryCode,
      batchName: spare.sequence,
      spareName: spare.sequence,
      spareCode,
      startMonth: spare.startMonth,
    });
    await feeExecute("DELETE FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId", { ledgerId });
    await feeExecute(`
      INSERT INTO internalserviceledgers
        (ledgerId,countryCode,batchName,requestNo,poNo,deviceCode,modelCode,nameEn,supplierId,undertakingUnitId,customerId,
         quantity,currency,reportingCurrency,exchangeRate,procurementCurrency,procurementToContractRate,vatRate,
         procurementTaxExcludedUnitPrice,procurementTaxSurcharge,contractRevenueIncludingTax,contractRevenueExcludingTax,
         procurementCost,internalServiceFeeTotal,internalServiceFeeReportingTotal,archivedAmount,manualAmount,remainingAmount,
         unallocatedAmount,startMonth,status,ledgerType,spareProcurementCost,spareContractExcludingTax,
         spareFirst24MonthlyAmount,spareNext36MonthlyAmount,spareBusinessKey,notes)
      VALUES
        (:ledgerId,:countryCode,:batchName,'','',:deviceCode,'',:nameEn,'','','',
         :quantity,'USD','USD',1,'USD',1,0,0,0,:total,:total,:procurement,:total,:total,0,0,:total,0,:startMonth,'启用',
         'spare',:procurement,:contractExcluding,:firstMonthly,:secondMonthly,:businessKey,'')
      ON DUPLICATE KEY UPDATE
        countryCode=VALUES(countryCode),batchName=VALUES(batchName),deviceCode=VALUES(deviceCode),nameEn=VALUES(nameEn),
        quantity=VALUES(quantity),currency='USD',reportingCurrency='USD',exchangeRate=1,procurementCurrency='USD',procurementToContractRate=1,
        contractRevenueIncludingTax=VALUES(contractRevenueIncludingTax),contractRevenueExcludingTax=VALUES(contractRevenueExcludingTax),
        internalServiceFeeTotal=VALUES(internalServiceFeeTotal),internalServiceFeeReportingTotal=VALUES(internalServiceFeeReportingTotal),
        remainingAmount=VALUES(remainingAmount),unallocatedAmount=0,startMonth=VALUES(startMonth),status='启用',
        ledgerType='spare',spareProcurementCost=VALUES(spareProcurementCost),
        spareContractExcludingTax=VALUES(spareContractExcludingTax),
        spareFirst24MonthlyAmount=VALUES(spareFirst24MonthlyAmount),
        spareNext36MonthlyAmount=VALUES(spareNext36MonthlyAmount),
        spareBusinessKey=VALUES(spareBusinessKey),notes=VALUES(notes)
    `, {
      ledgerId,
      countryCode: spare.countryCode,
      batchName: spare.sequence,
      deviceCode: spareCode,
      nameEn: spare.sequence,
      quantity: spare.quantity,
      total: spare.totalReporting,
      procurement: spare.procurementTotalReporting ?? 0,
      contractExcluding: spare.contractExcludingTaxReporting,
      firstMonthly: roundMoney(spare.first24Monthly),
      secondMonthly: roundMoney(spare.next36Monthly),
      businessKey,
      startMonth: spare.startMonth,
    });

    const firstMonthly = roundMoney(spare.first24Monthly);
    const secondMonthly = roundMoney(spare.next36Monthly);
    const calculatedTotal = roundMoney(firstMonthly * 24 + secondMonthly * 36);
    const residual = roundMoney(spare.totalReporting - calculatedTotal);
    for (let index = 0; index < 60; index += 1) {
      const firstStage = index < 24;
      const amount = index === 59
        ? roundMoney((firstStage ? firstMonthly : secondMonthly) + residual)
        : firstStage ? firstMonthly : secondMonthly;
      await feeExecute(`
        INSERT INTO monthlyinternalservicefees
          (id,ledgerId,writeOffMonth,monthIndex,countryCode,batchName,requestNo,poNo,deviceCode,modelCode,nameEn,
           supplierId,undertakingUnitId,customerId,quantity,currency,internalServiceFeeAmount,
           reportingCurrency,exchangeRate,internalServiceFeeReportingAmount,sourceType,adjustmentNo,archived)
        VALUES
          (:id,:ledgerId,:writeOffMonth,:monthIndex,:countryCode,:batchName,'','',:deviceCode,'',:nameEn,
           '','','',:quantity,'USD',:amount,'USD',1,:amount,'spare','',0)
      `, {
        id: `${ledgerId}-${String(index + 1).padStart(3, "0")}`,
        ledgerId,
        writeOffMonth: addMonths(spare.startMonth, index),
        monthIndex: index + 1,
        countryCode: spare.countryCode,
        batchName: spare.sequence,
        deviceCode: `SPARE-${spare.countryCode}-${spare.rowNumber}`,
        nameEn: spare.sequence,
        quantity: spare.quantity,
        amount,
      });
    }
    ledgerCount += 1;
  }
  return ledgerCount;
}

async function archiveManagementFeesThrough(cutoffMonth: string) {
  const monthRows = await feeQuery<Row>(`
    SELECT DISTINCT DATE_FORMAT(writeOffMonth, '%Y-%m-01') AS archiveMonth
    FROM monthlyinternalservicefees
    WHERE writeOffMonth <= :cutoffMonth AND archived=0
    ORDER BY archiveMonth
  `, { cutoffMonth: `${cutoffMonth}-01` });
  let snapshotCount = 0;
  let itemCount = 0;
  for (const [monthIndex, monthRow] of monthRows.entries()) {
    const archiveMonth = String(monthRow.archiveMonth);
    const rows = await feeQuery<Row>(`
      SELECT * FROM monthlyinternalservicefees
      WHERE writeOffMonth=:archiveMonth AND archived=0
      ORDER BY id
    `, { archiveMonth });
    if (!rows.length) continue;
    const snapshotNo = `ISF-HIST-${archiveMonth.slice(0, 7).replace("-", "")}-${monthIndex}-${Date.now()}`;
    const totalAmount = rows.reduce((total, row) => total + Number(row.internalServiceFeeAmount ?? 0), 0);
    const totalReportingAmount = rows.reduce((total, row) => total + Number(row.internalServiceFeeReportingAmount ?? 0), 0);
    const currencies = new Set(rows.map((row) => String(row.reportingCurrency ?? "")).filter(Boolean));
    const reportingCurrency = currencies.size === 1 ? Array.from(currencies)[0] : "MIXED";
    await feeExecute(`
      INSERT INTO internalservicefeesnapshots
        (snapshotNo,archiveMonth,countryCode,itemCount,totalAmount,reportingCurrency,totalReportingAmount,confirmedAt)
      VALUES
        (:snapshotNo,:archiveMonth,'',:itemCount,:totalAmount,:reportingCurrency,:totalReportingAmount,CURRENT_TIMESTAMP)
    `, { snapshotNo, archiveMonth, itemCount: rows.length, totalAmount, reportingCurrency, totalReportingAmount });
    for (const [index, row] of rows.entries()) {
      await feeExecute(`
        INSERT INTO internalservicefeesnapshotitems
          (id,snapshotNo,monthlyFeeId,ledgerId,writeOffMonth,countryCode,batchName,requestNo,poNo,deviceCode,
           supplierId,undertakingUnitId,customerId,currency,internalServiceFeeAmount,
           reportingCurrency,exchangeRate,internalServiceFeeReportingAmount,sourceType,adjustmentNo)
        VALUES
          (:id,:snapshotNo,:monthlyFeeId,:ledgerId,:writeOffMonth,:countryCode,:batchName,:requestNo,:poNo,:deviceCode,
           :supplierId,:undertakingUnitId,:customerId,:currency,:internalServiceFeeAmount,
           :reportingCurrency,:exchangeRate,:internalServiceFeeReportingAmount,:sourceType,:adjustmentNo)
      `, {
        ...row,
        id: `${snapshotNo}-${String(index + 1).padStart(5, "0")}`,
        snapshotNo,
        monthlyFeeId: row.id,
      });
    }
    await feeExecute(`
      UPDATE monthlyinternalservicefees
      SET archived=1,archivedAt=CURRENT_TIMESTAMP,archiveSnapshotNo=:snapshotNo
      WHERE writeOffMonth=:archiveMonth AND archived=0
    `, { snapshotNo, archiveMonth });
    await feeExecute(`
      UPDATE merge_power_internalservicejcmonths
      SET archived=1,snapshotNo=:snapshotNo
      WHERE month=:archiveMonth AND archived=0
    `, { snapshotNo, archiveMonth });
    snapshotCount += 1;
    itemCount += rows.length;
  }
  return { snapshotCount, itemCount };
}

function approvalMap(items: AdjustmentItem[], pricing: WorkbookPricing, rates: Map<string, { reportingCurrency: string; exchangeRate: number }>) {
  const byLedger = new Map<string, Record<string, number>>();
  const unmatched: Array<{
    itemId: string;
    adjustmentNo: string;
    batchName: string;
    deviceCode: string;
    modelCode: string;
    reason: string;
    candidateShapeKeys: string[];
  }> = [];
  let workbookMatches = 0;
  for (const item of items) {
    const rate = rates.get(item.ledgerId);
    if (!rate) continue;
    const key = exactKey(item.batchName, item.deviceCode, item.modelCode);
    const fallbackKey = exactKey(item.batchName, item.deviceCode, "");
    const originalCandidates = [Number(item.originalPrice) / rate.exchangeRate, Number(item.originalPrice) / 7.2];
    const adjustedCandidates = [Number(item.adjustedPrice) / rate.exchangeRate, Number(item.adjustedPrice) / 7.2];
    const shapePrice = (original: number, adjusted: number) => approvalShapeKey(item.batchName, item.deviceCode, item.quantity, original, adjusted);
    const candidateShapeKeys = originalCandidates.flatMap((original) => adjustedCandidates.map((adjusted) => shapePrice(original, adjusted)));
    const exactApproved = pricing.duplicateApprovalKeys.has(key) ? undefined : pricing.approvedReporting.get(key);
    const fallbackApproved = pricing.duplicateApprovalKeys.has(fallbackKey) ? undefined : pricing.approvedReporting.get(fallbackKey);
    let shapeApproved: number | undefined;
    for (const original of originalCandidates) {
      for (const adjusted of adjustedCandidates) {
        const shapeKey = shapePrice(original, adjusted);
        if (pricing.duplicateApprovalShapeKeys.has(shapeKey)) continue;
        const candidate = pricing.approvedReportingByShape.get(shapeKey);
        if (candidate != null) shapeApproved = candidate;
      }
    }
    if (shapeApproved == null) {
      const approximate = pricing.approvalShapes.filter((shape) =>
        shape.batchName === String(item.batchName).trim()
        && shape.deviceCode === String(item.deviceCode).trim()
        && shape.quantity === Number(item.quantity)
        && originalCandidates.some((price) => Math.abs(price - shape.originalPrice) <= 0.02)
        && adjustedCandidates.some((price) => Math.abs(price - shape.adjustedPrice) <= 0.02),
      );
      const values = Array.from(new Set(approximate.map((shape) => shape.approvedReporting)));
      if (values.length === 1) shapeApproved = values[0];
    }
    const batchDeviceApproved = pricing.duplicateApprovalBatchDeviceKeys.has(batchDeviceKey(item.batchName, item.deviceCode))
      ? undefined
      : pricing.approvedReportingByBatchDevice.get(batchDeviceKey(item.batchName, item.deviceCode));
    const approved = exactApproved ?? shapeApproved ?? batchDeviceApproved ?? fallbackApproved;
    if (approved == null) {
      unmatched.push({
        itemId: item.id,
        adjustmentNo: item.adjustmentNo,
        batchName: item.batchName,
        deviceCode: item.deviceCode,
        modelCode: item.modelCode,
        reason: "missing",
        candidateShapeKeys,
      });
      continue;
    }
    workbookMatches += 1;
    const current = byLedger.get(item.ledgerId) ?? {};
    current[item.id] = approved;
    byLedger.set(item.ledgerId, current);
  }
  return { byLedger, workbookMatches, unmatched };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const replaceArchives = process.argv.includes("--replace-archives");
  const workbookPath = argValue("excel") || defaultWorkbook;
  const archiveThrough = argValue("archive-through") || "2026-10";
  const ledgers = await billingLedgers();
  const items = await adjustmentItems();
  const safety = await preflight(apply && !replaceArchives);
  const pricing = await readWorkbookPricing(workbookPath, ledgers);
  const rates = await resolveRates(ledgers, pricing);
  const priceTargets = contractPriceTargets(ledgers, pricing, rates);
  const approvals = approvalMap(items, pricing, rates);
  const affectedLedgerIds = new Set(items.map((item) => item.ledgerId));

  const summary = {
    initializedLedgers: ledgers.length,
    affectedLedgers: affectedLedgerIds.size,
    confirmedAdjustmentItems: items.length,
    workbookContracts: priceTargets.targets.size,
    priceAdjustments: priceTargets.adjustments,
    contractsMissingWorkbookPrice: priceTargets.missing,
    workbookSpares: pricing.spares.length,
    archiveThrough,
    replaceArchives,
    workbookRateMatches: rates.size,
    workbookJcApprovalMatches: approvals.workbookMatches,
    unmatchedJcApprovalItems: approvals.unmatched,
    duplicateRateKeys: [...pricing.duplicateRateKeys],
    duplicateApprovalKeys: [...pricing.duplicateApprovalKeys],
    safety,
  };
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "PLAN", ...summary }, null, 2));
  if (!apply) return;

  const backup = await createBackup();
  console.log(`BACKUP ${backup.names.join(", ")}`);
  const ledgerIds = ledgers.map((ledger) => ledger.ledgerId);

  await withInternalFeeTransaction(async () => {
    if (replaceArchives) {
      await feeExecute("DELETE FROM internalservicefeesnapshotitems");
      await feeExecute("DELETE FROM internalservicefeesnapshots");
      await feeExecute("DELETE FROM monthlyinternalservicefees WHERE sourceType IN ('jc','jc_history','spare')");
    }
    for (const ledger of ledgers) {
      const config = rates.get(ledger.ledgerId)!;
      await feeExecute(`
        INSERT INTO internalserviceledgers
          (ledgerId,reportingCurrency,exchangeRate,procurementCurrency,procurementToContractRate)
        VALUES
          (:ledgerId,:reportingCurrency,:exchangeRate,:procurementCurrency,:procurementToContractRate)
        ON DUPLICATE KEY UPDATE
          reportingCurrency=VALUES(reportingCurrency),exchangeRate=VALUES(exchangeRate),
          procurementCurrency=VALUES(procurementCurrency),procurementToContractRate=VALUES(procurementToContractRate)
      `, { ledgerId: ledger.ledgerId, ...config });
    }

    for (const ledger of ledgers) {
      const target = priceTargets.targets.get(ledger.ledgerId);
      if (!target) continue;
      if (
        Math.abs(target.first24Price - Number(ledger.first24MonthPrice)) < 0.005
        && Math.abs(target.next36Price - Number(ledger.next36MonthPrice)) < 0.005
      ) continue;
      const difference = roundPrice(target.first24Price - Number(ledger.selfCalculatedUnitPrice ?? 0));
      await feeExecute(`
        UPDATE billinginstanceledgers SET
          first24MonthPrice=:first24Price,next36MonthPrice=:next36Price,
          differenceUnitPrice=:difference,
          differenceTotalPrice=:differenceTotal
        WHERE ledgerId=:ledgerId
      `, {
        ledgerId: ledger.ledgerId,
        first24Price: target.first24Price,
        next36Price: target.next36Price,
        difference,
        differenceTotal: roundMoney(difference * Number(ledger.quantity ?? 0)),
      });
      await rebuildBillingMonthlyRows(ledger.ledgerId);
    }

    for (const ledgerId of ledgerIds) {
      await feeExecute("DELETE FROM monthlyinternalservicefees WHERE ledgerId=:ledgerId", { ledgerId });
      await feeExecute(`
        DELETE m FROM merge_power_internalservicejcmonths m
        INNER JOIN merge_power_internalservicejccomponents c ON c.id=m.componentId
        WHERE c.ledgerId=:ledgerId
      `, { ledgerId });
      await feeExecute(
        "DELETE FROM merge_power_internalservicejcaudit WHERE componentId IN (SELECT id FROM merge_power_internalservicejccomponents WHERE ledgerId=:ledgerId)",
        { ledgerId },
      );
      await feeExecute("DELETE FROM merge_power_internalservicejccomponents WHERE ledgerId=:ledgerId", { ledgerId });
    }

    for (const ledger of ledgers) {
      try {
        if (affectedLedgerIds.has(ledger.ledgerId)) {
          await initializeJcAdjustments(ledger.ledgerId, systemActor, approvals.byLedger.get(ledger.ledgerId));
        } else {
          await regenerateInternalServiceLedger(ledger.ledgerId);
        }
      } catch (error) {
        throw new Error(`${ledger.batchName}/${ledger.deviceCode} 初始化失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await rebuildSpareLedgers(pricing.spares);

    await archiveManagementFeesThrough(archiveThrough);
  });

  const [result] = await dbQuery<Row>(`
    SELECT
      (SELECT COUNT(*) FROM internalserviceledgers) AS initializedLedgers,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE status='附件导入') AS spareLedgers,
      (SELECT COUNT(*) FROM internalserviceledgers WHERE internalServiceFeeReportingTotal IS NULL) AS missingReportingTotals,
      (SELECT COUNT(*) FROM monthlyinternalservicefees) AS monthlyRows,
      (SELECT COUNT(*) FROM monthlyinternalservicefees WHERE archived=1) AS archivedRows,
      (SELECT COUNT(*) FROM monthlyinternalservicefees WHERE sourceType='spare') AS spareRows,
      (SELECT COUNT(*) FROM internalservicefeesnapshots) AS snapshots,
      (SELECT COUNT(*) FROM monthlyinternalservicefees WHERE internalServiceFeeReportingAmount IS NULL) AS missingReportingRows,
      (SELECT COUNT(*) FROM merge_power_internalservicejccomponents) AS jcComponents,
      (SELECT COUNT(*) FROM merge_power_internalservicejccomponents WHERE confirmedAt IS NULL) AS pendingJcComponents,
      (SELECT COUNT(*) FROM merge_power_internalservicejccomponents WHERE approvedTotal IS NULL) AS missingJcApprovals
  `);
  console.log(JSON.stringify({ result: Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number(value ?? 0)])), backup: backup.names }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : "管理费重建失败");
    process.exitCode = 1;
  })
  .finally(closeDb);
