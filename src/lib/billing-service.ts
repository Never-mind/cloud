import { execute, queryRows, type Row } from "./db";
import { isConfirmedOrderStatus } from "./order-status";
import {
  applyBillingAdjustments,
  buildBillingLedgerDraft,
  buildMonthlyBillingRows,
  buildUpdatedBillingLedgerDraft,
  findLatestInstanceContract,
  findSelectedInstanceContract,
  firstDayOfMonth,
  calculateSelfCalculatedUnitPrice,
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

export type BillingAdjustmentDetail = {
  id?: string;
  adjustmentNo?: string;
  countryCode: string;
  batchName: string;
  requestNo?: string;
  poNo?: string;
  deviceCode: string;
  modelCode?: string;
  nameEn?: string;
  quantity?: number;
  currency: string;
  effectiveMonth: string;
  adjustedFirst24MonthPrice: number;
  adjustedNext36MonthPrice: number;
};

export type BillingAdjustmentDraft = {
  adjustmentNo: string;
  instanceContractNo: string;
  status?: string;
  reason?: string;
  items: BillingAdjustmentDetail[];
};

export async function listBillingAdjustments(searchParams: URLSearchParams) {
  const keyword = searchParams.get("keyword")?.trim();
  const whereParts: string[] = [];
  const params: Row = {};

  if (keyword) {
    whereParts.push(
      `(ba.adjustmentNo LIKE :keyword OR ba.instanceContractNo LIKE :keyword OR ba.reason LIKE :keyword OR bai.countryCode LIKE :keyword OR bai.batchName LIKE :keyword OR bai.deviceCode LIKE :keyword)`,
    );
    params.keyword = `%${keyword}%`;
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const rows = await queryRows<Row>(
    `
      SELECT
        ba.adjustmentNo,
        ba.instanceContractNo,
        ba.status,
        COALESCE(COUNT(bai.id), ba.itemCount, 0) AS itemCount,
        GROUP_CONCAT(DISTINCT bai.countryCode ORDER BY bai.countryCode SEPARATOR ', ') AS countryCode,
        GROUP_CONCAT(DISTINCT bai.batchName ORDER BY bai.batchName SEPARATOR ', ') AS batchName,
        GROUP_CONCAT(DISTINCT bai.deviceCode ORDER BY bai.deviceCode SEPARATOR ', ') AS deviceCode,
        ba.reason,
        DATE_FORMAT(ba.confirmedAt, '%Y-%m-%d') AS confirmedAt,
        DATE_FORMAT(ba.createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(ba.updatedAt, '%Y-%m-%d') AS updatedAt
      FROM billingadjustments ba
      LEFT JOIN billingadjustmentitems bai ON bai.adjustmentNo = ba.adjustmentNo
      ${where}
      GROUP BY ba.adjustmentNo, ba.instanceContractNo, ba.status, ba.itemCount, ba.reason, ba.confirmedAt, ba.createdAt, ba.updatedAt
      ORDER BY ba.createdAt DESC
    `,
    params,
  );

  return { rows, total: rows.length };
}

export async function getBillingAdjustment(adjustmentNo: string) {
  const adjustmentRows = await queryRows<Row>(
    `
      SELECT
        adjustmentNo,
        instanceContractNo,
        status,
        itemCount,
        reason,
        DATE_FORMAT(confirmedAt, '%Y-%m-%d') AS confirmedAt,
        DATE_FORMAT(createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(updatedAt, '%Y-%m-%d') AS updatedAt
      FROM billingadjustments
      WHERE adjustmentNo = :adjustmentNo
      LIMIT 1
    `,
    { adjustmentNo },
  );
  const adjustment = adjustmentRows[0] ?? null;
  const items = adjustment
    ? await queryRows<Row>(
        `
          SELECT
            id,
            adjustmentNo,
            countryCode,
            batchName,
            requestNo,
            poNo,
            deviceCode,
            modelCode,
            nameEn,
            quantity,
            currency,
            DATE_FORMAT(effectiveMonth, '%Y-%m-%d') AS effectiveMonth,
            adjustedFirst24MonthPrice,
            adjustedNext36MonthPrice
          FROM billingadjustmentitems
          WHERE adjustmentNo = :adjustmentNo
          ORDER BY countryCode, batchName, deviceCode, id
        `,
        { adjustmentNo },
      )
    : [];

  return { adjustment, items };
}

export async function saveBillingAdjustmentDraft(payload: BillingAdjustmentDraft) {
  const adjustmentNo = payload.adjustmentNo.trim();
  const instanceContractNo = payload.instanceContractNo.trim();
  if (!adjustmentNo) throw new Error("调整单号不能为空");
  if (!instanceContractNo) throw new Error("实例合同单号不能为空");

  const existing = await getBillingAdjustment(adjustmentNo);
  if (existing.adjustment && String(existing.adjustment.status) === "已确认") {
    throw new Error("已确认的调整单不可修改");
  }

  const items = payload.items.map((item, index) => normalizeBillingAdjustmentItem(adjustmentNo, item, index));
  if (!items.length) throw new Error("调整单明细不能为空");

  await execute(
    `
      INSERT INTO billingadjustments
        (adjustmentNo, instanceContractNo, status, itemCount, reason)
      VALUES
        (:adjustmentNo, :instanceContractNo, '草稿', :itemCount, :reason)
      ON DUPLICATE KEY UPDATE
        instanceContractNo = VALUES(instanceContractNo),
        itemCount = VALUES(itemCount),
        reason = VALUES(reason),
        updatedAt = CURRENT_TIMESTAMP
    `,
    {
      adjustmentNo,
      instanceContractNo,
      itemCount: items.length,
      reason: payload.reason ?? "",
    },
  );

  await execute("DELETE FROM billingadjustmentitems WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
  for (const item of items) {
    await execute(
      `
        INSERT INTO billingadjustmentitems
          (id, adjustmentNo, countryCode, batchName, requestNo, poNo, deviceCode, modelCode, nameEn,
           quantity, currency, effectiveMonth, adjustedFirst24MonthPrice, adjustedNext36MonthPrice)
        VALUES
          (:id, :adjustmentNo, :countryCode, :batchName, :requestNo, :poNo, :deviceCode, :modelCode, :nameEn,
           :quantity, :currency, :effectiveMonth, :adjustedFirst24MonthPrice, :adjustedNext36MonthPrice)
      `,
      item,
    );
  }

  return getBillingAdjustment(adjustmentNo);
}

export async function deleteBillingAdjustmentDraft(adjustmentNo: string) {
  const { adjustment } = await getBillingAdjustment(adjustmentNo);
  if (!adjustment) return;
  if (String(adjustment.status) === "已确认") throw new Error("已确认的调整单不可删除");
  await execute("DELETE FROM billingadjustmentitems WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
  await execute("DELETE FROM billingadjustments WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
}

export async function listAvailableBillingLines() {
  const [purchaseLines, ledgerRows, contractRows] = await Promise.all([
    queryRows<PurchaseLineRow>(
      `
        SELECT
          poi.id AS purchaseOrderItemId,
          req.countryCode,
          req.batchName,
          COALESCE(poi.requestNo, po.requestNo, ri.requestNo) AS requestNo,
          poi.poNo,
          ri.deviceCode,
          im.modelCode,
          im.nameEn,
          ri.supplierId,
          ri.undertakingUnitId,
          ri.quantity,
          po.currency AS actualCurrency,
          poi.unitPrice AS actualUnitPrice,
          COALESCE(poi.taxExcludedUnitPrice, poi.unitPrice, 0) AS taxExcludedUnitPrice,
          COALESCE(poi.taxSurcharge, 0) AS taxSurcharge,
          COALESCE(country.vatRate, 0) AS vatRate,
          po.status AS purchaseStatus,
          req.status AS requestStatus
        FROM purchaseorderitems poi
        LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
        LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
        LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
        LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
        LEFT JOIN countries country ON country.code = req.countryCode
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
        selfCalculatedUnitPrice: calculateSelfCalculatedUnitPrice(line),
        differenceUnitPrice: Number(contract?.first24MonthPrice ?? 0) - calculateSelfCalculatedUnitPrice(line),
        differenceTotalPrice: Number(line.quantity ?? 0) * (Number(contract?.first24MonthPrice ?? 0) - calculateSelfCalculatedUnitPrice(line)),
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
          selfCalculatedUnitPrice = :selfCalculatedUnitPrice,
          differenceUnitPrice = :differenceUnitPrice,
          differenceTotalPrice = :differenceTotalPrice,
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
        COALESCE(NULLIF(monthlybillingwriteoffs.supplierId, ''), ri.linkedSupplierId, riByBusinessKey.fallbackSupplierId) AS supplierId,
        COALESCE(NULLIF(monthlybillingwriteoffs.undertakingUnitId, ''), ri.linkedUndertakingUnitId, riByBusinessKey.fallbackUndertakingUnitId) AS undertakingUnitId,
        quantity,
        instanceContractNo,
        currency,
        monthlyTotalAmount,
        monthlyAmount,
        selfCalculatedUnitPrice,
        differenceUnitPrice,
        differenceTotalPrice,
        sourceType,
        adjustmentNo,
        createdAt
      FROM monthlybillingwriteoffs
      LEFT JOIN (
        SELECT ledgerId AS linkedLedgerId, purchaseOrderItemId AS linkedPurchaseOrderItemId
        FROM billinginstanceledgers
      ) AS ledger ON ledger.linkedLedgerId = monthlybillingwriteoffs.ledgerId
      LEFT JOIN (
        SELECT id AS linkedRequestItemId, supplierId AS linkedSupplierId, undertakingUnitId AS linkedUndertakingUnitId
        FROM requestitems
      ) AS ri ON ri.linkedRequestItemId = ledger.linkedPurchaseOrderItemId
      LEFT JOIN (
        SELECT requestNo AS keyRequestNo, deviceCode AS keyDeviceCode, supplierId AS fallbackSupplierId, undertakingUnitId AS fallbackUndertakingUnitId
        FROM requestitems
      ) AS riByBusinessKey
        ON riByBusinessKey.keyRequestNo = monthlybillingwriteoffs.requestNo
        AND riByBusinessKey.keyDeviceCode = monthlybillingwriteoffs.deviceCode
      ${where}
      ORDER BY writeOffMonth DESC, ledgerId
    `,
    params,
  );

  return { rows, total: rows.length };
}

export async function confirmBillingAdjustment(adjustmentNo: string) {
  const { adjustment, items } = await getBillingAdjustment(adjustmentNo);
  if (!adjustment) throw new Error("调整单不存在");
  if (String(adjustment.status) === "已确认") return adjustment;
  if (!items.length) throw new Error("调整单明细不能为空");

  await execute(
    `
      UPDATE billingadjustments
      SET status = '已确认',
          confirmedAt = CURRENT_TIMESTAMP
      WHERE adjustmentNo = :adjustmentNo
    `,
    { adjustmentNo },
  );

  const ledgerIds = new Set<string>();
  for (const item of items) {
    const ledgers = await queryRows<Row>(
      `
        SELECT *
        FROM billinginstanceledgers
        WHERE countryCode = :countryCode
          AND batchName = :batchName
          AND requestNo = :requestNo
          AND deviceCode = :deviceCode
      `,
      {
        countryCode: item.countryCode,
        batchName: item.batchName,
        requestNo: item.requestNo,
        deviceCode: item.deviceCode,
      },
    );
    if (!ledgers.length) {
      throw new Error(`未找到匹配的月账单台账：${item.countryCode}/${item.batchName}/${item.deviceCode}`);
    }
    ledgers.forEach((ledger) => ledgerIds.add(String(ledger.ledgerId)));
  }

  for (const ledgerId of ledgerIds) {
    const ledger = await getBillingLedgerDraft(ledgerId);
    if (ledger) await replaceMonthlyBillingRows(ledgerId, await buildMonthlyBillingRowsWithConfirmedAdjustments(ledger));
  }

  return { adjustmentNo, updatedLedgers: ledgerIds.size };
}

async function insertBillingLedger(ledger: BillingLedgerDraft) {
  await execute(
    `
      INSERT INTO billinginstanceledgers
        (ledgerId, purchaseOrderItemId, countryCode, batchName, requestNo, poNo, deviceCode,
         modelCode, nameEn, supplierId, undertakingUnitId, quantity, actualCurrency, actualUnitPrice,
         taxExcludedUnitPrice, taxSurcharge, vatRate, selfCalculatedUnitPrice, instanceContractNo,
         contractCurrency, first24MonthPrice, next36MonthPrice, differenceUnitPrice, differenceTotalPrice,
         startMonth, status, confirmedAt)
      VALUES
        (:ledgerId, :purchaseOrderItemId, :countryCode, :batchName, :requestNo, :poNo, :deviceCode,
         :modelCode, :nameEn, :supplierId, :undertakingUnitId, :quantity, :actualCurrency, :actualUnitPrice,
         :taxExcludedUnitPrice, :taxSurcharge, :vatRate, :selfCalculatedUnitPrice, :instanceContractNo,
         :contractCurrency, :first24MonthPrice, :next36MonthPrice, :differenceUnitPrice, :differenceTotalPrice,
         :startMonth, :status, CURRENT_TIMESTAMP)
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
        supplierId,
        undertakingUnitId,
        quantity,
        actualCurrency,
        actualUnitPrice,
        taxExcludedUnitPrice,
        taxSurcharge,
        vatRate,
        selfCalculatedUnitPrice,
        instanceContractNo,
        contractCurrency,
        first24MonthPrice,
        next36MonthPrice,
        differenceUnitPrice,
        differenceTotalPrice,
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
        ba.adjustmentNo,
        ba.instanceContractNo,
        DATE_FORMAT(bai.effectiveMonth, '%Y-%m-%d') AS effectiveMonth,
        bai.currency,
        bai.adjustedFirst24MonthPrice,
        bai.adjustedNext36MonthPrice,
        ba.confirmedAt
      FROM billingadjustments ba
      INNER JOIN billingadjustmentitems bai ON bai.adjustmentNo = ba.adjustmentNo
      WHERE bai.countryCode = :countryCode
        AND bai.batchName = :batchName
        AND (bai.requestNo = :requestNo OR bai.requestNo = '')
        AND bai.deviceCode = :deviceCode
        AND ba.confirmedAt IS NOT NULL
      ORDER BY ba.confirmedAt ASC, ba.adjustmentNo ASC
    `,
    {
      countryCode: ledger.countryCode,
      batchName: ledger.batchName,
      requestNo: ledger.requestNo,
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
           poNo, deviceCode, modelCode, nameEn, supplierId, undertakingUnitId, quantity,
           instanceContractNo, currency, monthlyAmount, monthlyTotalAmount, selfCalculatedUnitPrice,
           differenceUnitPrice, differenceTotalPrice, sourceType, adjustmentNo)
        VALUES
          (:id, :ledgerId, :writeOffMonth, :monthIndex, :stage, :countryCode, :batchName, :requestNo,
           :poNo, :deviceCode, :modelCode, :nameEn, :supplierId, :undertakingUnitId, :quantity,
           :instanceContractNo, :currency, :monthlyAmount, :monthlyTotalAmount, :selfCalculatedUnitPrice,
           :differenceUnitPrice, :differenceTotalPrice, :sourceType, :adjustmentNo)
      `,
      row,
    );
  }
}

function normalizeBillingAdjustmentItem(adjustmentNo: string, item: BillingAdjustmentDetail, index: number) {
  const countryCode = String(item.countryCode ?? "").trim();
  const batchName = String(item.batchName ?? "").trim();
  const deviceCode = String(item.deviceCode ?? "").trim();
  const currency = String(item.currency ?? "").trim();
  const effectiveMonth = firstDayOfMonth(String(item.effectiveMonth ?? ""));
  const adjustedFirst24MonthPrice = Number(item.adjustedFirst24MonthPrice ?? 0);
  const adjustedNext36MonthPrice = Number(item.adjustedNext36MonthPrice ?? 0);

  if (!countryCode) throw new Error(`第 ${index + 1} 条明细国家不能为空`);
  if (!batchName) throw new Error(`第 ${index + 1} 条明细批次号不能为空`);
  if (!deviceCode) throw new Error(`第 ${index + 1} 条明细实例编码不能为空`);
  if (!currency) throw new Error(`第 ${index + 1} 条明细币种不能为空`);
  if (!effectiveMonth || Number.isNaN(new Date(`${effectiveMonth}T00:00:00`).getTime())) {
    throw new Error(`第 ${index + 1} 条明细生效月份不正确`);
  }
  if (!Number.isFinite(adjustedFirst24MonthPrice)) throw new Error(`第 ${index + 1} 条明细前24个月价格不正确`);
  if (!Number.isFinite(adjustedNext36MonthPrice)) throw new Error(`第 ${index + 1} 条明细后36个月价格不正确`);

  return {
    id: item.id?.trim() || `BAI-${adjustmentNo}-${String(index + 1).padStart(3, "0")}`,
    adjustmentNo,
    countryCode,
    batchName,
    requestNo: String(item.requestNo ?? "").trim(),
    poNo: String(item.poNo ?? "").trim(),
    deviceCode,
    modelCode: String(item.modelCode ?? "").trim(),
    nameEn: String(item.nameEn ?? "").trim(),
    quantity: Number(item.quantity ?? 0),
    currency,
    effectiveMonth,
    adjustedFirst24MonthPrice,
    adjustedNext36MonthPrice,
  };
}
