import { execute, queryRows, type Row } from "./db";
import { isConfirmedOrderStatus } from "./order-status";
import {
  applyBillingAdjustment,
  applyBillingAdjustments,
  buildBillingLedgerDraft,
  buildMonthlyBillingRows,
  buildUpdatedBillingLedgerDraft,
  findLatestInstanceContract,
  findSelectedInstanceContract,
  firstDayOfMonth,
  type BillingInstanceContract,
  type BillingAdjustmentInput,
  type BillingLedgerDraft,
  type BillingPurchaseLine,
  type MonthlyBillingRow,
} from "./billing-workflow";

type PurchaseLineRow = BillingPurchaseLine & {
  purchaseStatus?: string | null;
  requestStatus?: string | null;
};

export type AvailableBillingLine = BillingPurchaseLine & {
  instanceContractNo: string;
  contractCurrency: string;
  first24MonthPrice: number;
  next36MonthPrice: number;
  startMonth: string;
};

export async function listAvailableBillingLines() {
  const [purchaseLines, ledgerRows, contractRows] = await Promise.all([
    queryRows<PurchaseLineRow>(
      `
        SELECT
          poi.id AS purchaseOrderItemId,
          req.countryCode,
          req.batchName,
          po.requestNo,
          poi.poNo,
          ri.deviceCode,
          im.modelCode,
          im.nameEn,
          ri.quantity,
          po.currency AS actualCurrency,
          poi.unitPrice AS actualUnitPrice,
          po.status AS purchaseStatus,
          req.status AS requestStatus
        FROM purchaseorderitems poi
        LEFT JOIN purchaseorders po ON po.poNo = poi.poNo
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(po.requestNo, ri.requestNo)
        LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
        ORDER BY req.countryCode, req.batchName, poi.id
      `,
    ),
    queryRows<{ purchaseOrderItemId: string }>("SELECT purchaseOrderItemId FROM billinginstanceledgers"),
    queryRows<BillingInstanceContract>(
      `
        SELECT
          contractNo,
          countryCode,
          deviceCode,
          currency,
          first24MonthPriceUSD AS first24MonthPrice,
          next36MonthPriceUSD AS next36MonthPrice,
          createdAt,
          dateSigned
        FROM instancecontracts
        ORDER BY createdAt DESC
      `,
    ),
  ]);
  const occupied = new Set(ledgerRows.map((row) => String(row.purchaseOrderItemId)));

  return purchaseLines
    .filter(
      (line) =>
        isConfirmedOrderStatus("purchase", line.purchaseStatus) &&
        isConfirmedOrderStatus("requests", line.requestStatus) &&
        !occupied.has(line.purchaseOrderItemId),
    )
    .map((line) => {
      const contract = findLatestInstanceContract(line, contractRows);
      return {
        ...line,
        quantity: Number(line.quantity ?? 0),
        actualUnitPrice: Number(line.actualUnitPrice ?? 0),
        instanceContractNo: contract?.contractNo ?? "",
        contractCurrency: contract?.currency ?? "",
        first24MonthPrice: Number(contract?.first24MonthPrice ?? 0),
        next36MonthPrice: Number(contract?.next36MonthPrice ?? 0),
        startMonth: new Date().toISOString().slice(0, 10),
      };
    });
}

export async function confirmBillingLedgers({
  lines,
}: {
  lines: Array<{ purchaseOrderItemId: string; startMonth: string; instanceContractNo?: string }>;
}) {
  const availableLines = await listAvailableBillingLines();
  const lineById = new Map(availableLines.map((line) => [line.purchaseOrderItemId, line]));
  const contractRows = await queryRows<BillingInstanceContract>(
    `
      SELECT
        contractNo,
        countryCode,
        deviceCode,
        currency,
        first24MonthPriceUSD AS first24MonthPrice,
        next36MonthPriceUSD AS next36MonthPrice,
        createdAt,
        dateSigned
      FROM instancecontracts
    `,
  );
  const created: BillingLedgerDraft[] = [];

  for (const input of lines) {
    const line = lineById.get(input.purchaseOrderItemId);
    if (!line) continue;
    const contract = findSelectedInstanceContract(
      line,
      contractRows,
      input.instanceContractNo ?? line.instanceContractNo,
    );
    if (!contract) throw new Error(`${line.purchaseOrderItemId} 未匹配到实例合同`);

    const ledger = buildBillingLedgerDraft({
      purchaseLine: line,
      contract,
      startMonth: input.startMonth,
    });

    await insertBillingLedger(ledger);
    await replaceMonthlyBillingRows(ledger.ledgerId, await buildMonthlyBillingRowsWithConfirmedAdjustments(ledger));
    created.push(ledger);
  }

  return { created };
}

export async function updateBillingLedger(
  ledgerId: string,
  input: { instanceContractNo?: string | null; startMonth?: string | null },
) {
  const ledger = await getBillingLedgerDraft(ledgerId);
  if (!ledger) throw new Error("月账单台账不存在");

  const contractRows = await queryRows<BillingInstanceContract>(
    `
      SELECT
        contractNo,
        countryCode,
        deviceCode,
        currency,
        first24MonthPriceUSD AS first24MonthPrice,
        next36MonthPriceUSD AS next36MonthPrice,
        createdAt,
        dateSigned
      FROM instancecontracts
    `,
  );
  const contract = findSelectedInstanceContract(
    ledger,
    contractRows,
    input.instanceContractNo ?? ledger.instanceContractNo,
  );
  if (!contract) throw new Error("所选实例合同与当前台账的国家或实例编码不匹配");

  const updated = buildUpdatedBillingLedgerDraft({
    currentLedger: ledger,
    contract,
    startMonth: input.startMonth ?? ledger.startMonth,
  });

  await execute(
    `
      UPDATE billinginstanceledgers
      SET instanceContractNo = :instanceContractNo,
          contractCurrency = :contractCurrency,
          first24MonthPrice = :first24MonthPrice,
          next36MonthPrice = :next36MonthPrice,
          startMonth = :startMonth,
          confirmedAt = CURRENT_TIMESTAMP
      WHERE ledgerId = :ledgerId
    `,
    updated,
  );
  await replaceMonthlyBillingRows(updated.ledgerId, await buildMonthlyBillingRowsWithConfirmedAdjustments(updated));

  return getBillingLedgerDraft(ledgerId);
}

export async function deleteBillingLedger(ledgerId: string) {
  await execute("DELETE FROM monthlybillingwriteoffs WHERE ledgerId = :ledgerId", { ledgerId });
  await execute("DELETE FROM billinginstanceledgers WHERE ledgerId = :ledgerId", { ledgerId });
}

export async function listMonthlyBillingWriteOffs(searchParams: URLSearchParams) {
  const keyword = searchParams.get("keyword")?.trim();
  const countryCode = searchParams.get("countryCode")?.trim();
  const batchName = searchParams.get("batchName")?.trim();
  const startMonth = searchParams.get("startMonth")?.trim();
  const endMonth = searchParams.get("endMonth")?.trim();
  const whereParts: string[] = [];
  const params: Row = {};

  if (keyword) {
    whereParts.push(
      `(ledgerId LIKE :keyword OR countryCode LIKE :keyword OR batchName LIKE :keyword OR requestNo LIKE :keyword OR poNo LIKE :keyword OR deviceCode LIKE :keyword OR nameEn LIKE :keyword OR instanceContractNo LIKE :keyword)`,
    );
    params.keyword = `%${keyword}%`;
  }
  if (countryCode) {
    whereParts.push("countryCode = :countryCode");
    params.countryCode = countryCode;
  }
  if (batchName) {
    whereParts.push("batchName = :batchName");
    params.batchName = batchName;
  }
  if (startMonth) {
    whereParts.push("writeOffMonth >= :startMonth");
    params.startMonth = firstDayOfMonth(startMonth);
  }
  if (endMonth) {
    whereParts.push("writeOffMonth <= :endMonth");
    params.endMonth = firstDayOfMonth(endMonth);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const rows = await queryRows<Row>(
    `
      SELECT
        id,
        ledgerId,
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        monthIndex,
        stage,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        nameEn,
        quantity,
        instanceContractNo,
        currency,
        monthlyTotalAmount,
        monthlyAmount,
        sourceType,
        adjustmentNo,
        createdAt
      FROM monthlybillingwriteoffs
      ${where}
      ORDER BY writeOffMonth DESC, ledgerId
    `,
    params,
  );

  return { rows, total: rows.length };
}

export async function confirmBillingAdjustment(adjustmentNo: string) {
  const rows = await queryRows<Row>(
    `
      SELECT
        adjustmentNo,
        status,
        countryCode,
        batchName,
        deviceCode,
        DATE_FORMAT(effectiveMonth, '%Y-%m-%d') AS effectiveMonth,
        adjustedFirst24MonthPrice,
        adjustedNext36MonthPrice,
        currency
      FROM billingadjustments
      WHERE adjustmentNo = :adjustmentNo
      LIMIT 1
    `,
    { adjustmentNo },
  );
  const adjustment = rows[0];
  if (!adjustment) throw new Error("调整单不存在");
  if (String(adjustment.status) === "已确认") return adjustment;

  const ledgers = await queryRows<Row>(
    `
      SELECT *
      FROM billinginstanceledgers
      WHERE countryCode = :countryCode
        AND batchName = :batchName
        AND deviceCode = :deviceCode
    `,
    {
      countryCode: adjustment.countryCode,
      batchName: adjustment.batchName,
      deviceCode: adjustment.deviceCode,
    },
  );
  if (!ledgers.length) throw new Error("未找到匹配的月账单台账");

  for (const ledger of ledgers) {
    const monthlyRows = await queryRows<MonthlyBillingRow>(
      `
        SELECT
          id,
          ledgerId,
          DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
          monthIndex,
          stage,
          countryCode,
          batchName,
          requestNo,
          poNo,
          deviceCode,
          modelCode,
          nameEn,
          quantity,
          instanceContractNo,
          currency,
          monthlyTotalAmount,
          monthlyAmount,
          sourceType,
          adjustmentNo
        FROM monthlybillingwriteoffs
        WHERE ledgerId = :ledgerId
        ORDER BY monthIndex
      `,
      { ledgerId: ledger.ledgerId },
    );
    const adjustedRows = applyBillingAdjustment(monthlyRows, {
      adjustmentNo,
      effectiveMonth: String(adjustment.effectiveMonth),
      currency: String(adjustment.currency ?? ""),
      adjustedFirst24MonthPrice: Number(adjustment.adjustedFirst24MonthPrice ?? 0),
      adjustedNext36MonthPrice: Number(adjustment.adjustedNext36MonthPrice ?? 0),
    });
    await replaceMonthlyBillingRows(String(ledger.ledgerId), adjustedRows);
  }

  await execute(
    `
      UPDATE billingadjustments
      SET status = '已确认',
          confirmedAt = CURRENT_TIMESTAMP
      WHERE adjustmentNo = :adjustmentNo
    `,
    { adjustmentNo },
  );

  return { adjustmentNo, updatedLedgers: ledgers.length };
}

async function insertBillingLedger(ledger: BillingLedgerDraft) {
  await execute(
    `
      INSERT INTO billinginstanceledgers
        (ledgerId, purchaseOrderItemId, countryCode, batchName, requestNo, poNo, deviceCode,
         modelCode, nameEn, quantity, actualCurrency, actualUnitPrice, instanceContractNo,
         contractCurrency, first24MonthPrice, next36MonthPrice, startMonth, status, confirmedAt)
      VALUES
        (:ledgerId, :purchaseOrderItemId, :countryCode, :batchName, :requestNo, :poNo, :deviceCode,
         :modelCode, :nameEn, :quantity, :actualCurrency, :actualUnitPrice, :instanceContractNo,
         :contractCurrency, :first24MonthPrice, :next36MonthPrice, :startMonth, :status, CURRENT_TIMESTAMP)
    `,
    ledger,
  );
}

async function getBillingLedgerDraft(ledgerId: string) {
  const rows = await queryRows<BillingLedgerDraft>(
    `
      SELECT
        ledgerId,
        purchaseOrderItemId,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        nameEn,
        quantity,
        actualCurrency,
        actualUnitPrice,
        instanceContractNo,
        contractCurrency,
        first24MonthPrice,
        next36MonthPrice,
        DATE_FORMAT(startMonth, '%Y-%m-%d') AS startMonth,
        status
      FROM billinginstanceledgers
      WHERE ledgerId = :ledgerId
      LIMIT 1
    `,
    { ledgerId },
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    quantity: Number(row.quantity ?? 0),
    actualUnitPrice: Number(row.actualUnitPrice ?? 0),
    first24MonthPrice: Number(row.first24MonthPrice ?? 0),
    next36MonthPrice: Number(row.next36MonthPrice ?? 0),
  };
}

async function buildMonthlyBillingRowsWithConfirmedAdjustments(ledger: BillingLedgerDraft) {
  const rows = buildMonthlyBillingRows(ledger);
  const adjustments = await listConfirmedBillingAdjustmentsForLedger(ledger);
  return applyBillingAdjustments(rows, adjustments);
}

async function listConfirmedBillingAdjustmentsForLedger(ledger: BillingLedgerDraft) {
  const rows = await queryRows<BillingAdjustmentInput>(
    `
      SELECT
        adjustmentNo,
        DATE_FORMAT(effectiveMonth, '%Y-%m-%d') AS effectiveMonth,
        currency,
        adjustedFirst24MonthPrice,
        adjustedNext36MonthPrice,
        confirmedAt
      FROM billingadjustments
      WHERE countryCode = :countryCode
        AND batchName = :batchName
        AND deviceCode = :deviceCode
        AND confirmedAt IS NOT NULL
      ORDER BY confirmedAt ASC, adjustmentNo ASC
    `,
    {
      countryCode: ledger.countryCode,
      batchName: ledger.batchName,
      deviceCode: ledger.deviceCode,
    },
  );

  return rows.map((row) => ({
    ...row,
    adjustedFirst24MonthPrice: Number(row.adjustedFirst24MonthPrice ?? 0),
    adjustedNext36MonthPrice: Number(row.adjustedNext36MonthPrice ?? 0),
  }));
}

async function replaceMonthlyBillingRows(ledgerId: string, rows: MonthlyBillingRow[]) {
  await execute("DELETE FROM monthlybillingwriteoffs WHERE ledgerId = :ledgerId", { ledgerId });
  for (const row of rows) {
    await execute(
      `
        INSERT INTO monthlybillingwriteoffs
          (id, ledgerId, writeOffMonth, monthIndex, stage, countryCode, batchName, requestNo,
           poNo, deviceCode, modelCode, nameEn, quantity, instanceContractNo, currency,
           monthlyAmount, monthlyTotalAmount, sourceType, adjustmentNo)
        VALUES
          (:id, :ledgerId, :writeOffMonth, :monthIndex, :stage, :countryCode, :batchName, :requestNo,
           :poNo, :deviceCode, :modelCode, :nameEn, :quantity, :instanceContractNo, :currency,
           :monthlyAmount, :monthlyTotalAmount, :sourceType, :adjustmentNo)
      `,
      row,
    );
  }
}
