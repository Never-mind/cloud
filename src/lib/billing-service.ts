import { execute, executeInTransaction, queryRows, withTransaction, type Row } from "./db";
import { attachPartyCodes } from "./party-display";
import { regenerateInternalServiceLedger } from "./internal-service-fee-service";
import { DEFAULT_PAGE_SIZE, getKnownNumber, getKnownTotal, normalizePageSize } from "./pagination";
import { appendTableFilterOptionConditions, appendTableInFilter, formatTableDateExpression, getTableFilterOptionsOrderBy, getTableSort, listSqlFilterOptions } from "./table-query";
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
  const status = searchParams.get("status")?.trim();
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const whereParts: string[] = [];
  const params: Row = {};
  const filterExpressions: Record<string, string> = {
    adjustmentNo: "ba.adjustmentNo", instanceContractNo: "ba.instanceContractNo", status: "ba.status", itemCount: "ba.itemCount",
    countryCode: "bai.countryCode", batchName: "bai.batchName", deviceCode: "bai.deviceCode", reason: "ba.reason",
  };
  const sortExpressions: Record<string, string> = {
    ...filterExpressions,
    itemCount: "COUNT(bai.id)", countryCode: "MIN(bai.countryCode)", batchName: "MIN(bai.batchName)", deviceCode: "MIN(bai.deviceCode)",
    confirmedAt: "ba.confirmedAt", createdAt: "ba.createdAt", updatedAt: "ba.updatedAt",
  };
  for (const [field, expression] of Object.entries(filterExpressions)) appendTableInFilter(whereParts, params, expression, field, searchParams, "billingAdjustment");

  if (keyword) {
    whereParts.push(
      `(ba.adjustmentNo LIKE :keyword OR ba.instanceContractNo LIKE :keyword OR ba.reason LIKE :keyword OR bai.countryCode LIKE :keyword OR bai.batchName LIKE :keyword OR bai.deviceCode LIKE :keyword)`,
    );
    params.keyword = `%${keyword}%`;
  }
  if (status) {
    whereParts.push("ba.status = :status");
    params.status = status;
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const groupedFrom = `
    FROM billingadjustments ba
    LEFT JOIN billingadjustmentitems bai ON bai.adjustmentNo = ba.adjustmentNo
    ${where}
    GROUP BY ba.adjustmentNo, ba.instanceContractNo, ba.status, ba.itemCount, ba.reason, ba.confirmedAt, ba.createdAt, ba.updatedAt
  `;
  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM (SELECT ba.adjustmentNo ${groupedFrom}) grouped`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
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
      ${groupedFrom}
      ${getTableSort(searchParams, sortExpressions) || "ORDER BY ba.createdAt DESC"}
      LIMIT :limit OFFSET :offset
    `,
    { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  );

  return { rows, total, page, pageSize, totalPages };
}

export async function listBillingAdjustmentFilterOptions(searchParams: URLSearchParams) {
  const expressions: Record<string, string> = {
    adjustmentNo: "ba.adjustmentNo", instanceContractNo: "ba.instanceContractNo", status: "ba.status", countryCode: "bai.countryCode", batchName: "bai.batchName", deviceCode: "bai.deviceCode", reason: "ba.reason",
  };
  const field = searchParams.get("field")?.trim() ?? "";
  const expression = expressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };
  const params: Row = {};
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const where = [`${expression} IS NOT NULL`, `TRIM(CAST(${expression} AS CHAR)) <> ''`];
  if (keyword) { where.push(`${expression} LIKE :optionKeyword`); params.optionKeyword = `%${keyword}%`; }
  appendTableFilterOptionConditions(where, params, expressions, searchParams, field);
  const rows = await queryRows<{ value: string; count: number }>(`SELECT ${expression} AS value, COUNT(*) AS count FROM billingadjustments ba LEFT JOIN billingadjustmentitems bai ON bai.adjustmentNo = ba.adjustmentNo WHERE ${where.join(" AND ")} GROUP BY ${expression} ORDER BY ${getTableFilterOptionsOrderBy(field, expression)} LIMIT 500`, params);
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
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
            adjustedNext36MonthPrice,
            DATE_FORMAT(createdAt, '%Y-%m-%d') AS createdAt,
            DATE_FORMAT(updatedAt, '%Y-%m-%d') AS updatedAt
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

export async function listAvailableBillingLines(options: {
  page?: number;
  pageSize?: number;
  keyword?: string;
  countryCode?: string;
  purchaseOrderItemIds?: string[];
  requestType?: string;
  searchParams?: URLSearchParams;
} = {}) {
  const requestedPage = Math.max(1, Math.floor(Number(options.page ?? 1) || 1));
  const conditions = [
    "po.status LIKE :purchaseStatus",
    "req.status <> :requestDraftStatus",
    "NOT EXISTS (SELECT 1 FROM billinginstanceledgers occupied WHERE occupied.purchaseOrderItemId = poi.id)",
    "COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') <> :sparePartType",
  ];
  const params: Row = { purchaseStatus: "%确认%", requestDraftStatus: "草稿", sparePartType: "备件" };
  if (options.requestType?.trim() && options.requestType.trim() !== "备件") {
    conditions.push("COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') = :requestType");
    params.requestType = options.requestType.trim();
  }
  if (options.countryCode?.trim()) {
    conditions.push("req.countryCode = :countryCode");
    params.countryCode = options.countryCode.trim();
  }
  if (options.keyword?.trim()) {
    conditions.push("(req.countryCode LIKE :keyword OR req.batchName LIKE :keyword OR COALESCE(poi.requestNo, po.requestNo, ri.requestNo) LIKE :keyword OR poi.poNo LIKE :keyword OR ri.deviceCode LIKE :keyword OR im.modelCode LIKE :keyword OR im.nameEn LIKE :keyword)");
    params.keyword = `%${options.keyword.trim()}%`;
  }
  const filterExpressions: Record<string, string> = {
    countryCode: "req.countryCode", batchName: "req.batchName", requestNo: "COALESCE(poi.requestNo, po.requestNo, ri.requestNo)",
    poNo: "poi.poNo", deviceCode: "ri.deviceCode", requestType: "COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机')",
    modelCode: "im.modelCode", nameEn: "im.nameEn", quantity: "ri.quantity", actualCurrency: "po.currency",
    actualUnitPrice: "poi.unitPrice", taxExcludedUnitPrice: "COALESCE(poi.taxExcludedUnitPrice, poi.unitPrice, 0)", taxSurcharge: "COALESCE(poi.taxSurcharge, 0)",
    undertakingUnitCode: "COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), unit.undertakingUnitCode)",
    supplierCode: "COALESCE(NULLIF(supplier.shortName, ''), NULLIF(supplier.nameCn, ''), supplier.supplierCode)",
    customerCode: "COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode)",
  };
  if (options.searchParams) {
    for (const [field, expression] of Object.entries(filterExpressions)) {
      appendTableInFilter(conditions, params, expression, field, options.searchParams, "availableBilling");
    }
  }
  const requestedSort = options.searchParams ? getTableSort(options.searchParams, filterExpressions) : "";
  const ids = Array.from(new Set((options.purchaseOrderItemIds ?? []).map(String).filter(Boolean)));
  // Browsing remains capped. Workflow commands fetch every explicit selection,
  // including IDs chosen from previous pages.
  const pageSize = ids.length
    ? Math.max(ids.length, 1)
    : Math.min(100, Math.max(1, Math.floor(Number(options.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)));
  if (ids.length) { conditions.push("poi.id IN (:purchaseOrderItemIds)"); params.purchaseOrderItemIds = ids; }
  const sourceFrom = `
    FROM purchaseorderitems poi
    LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
    LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
    LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
    LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
    LEFT JOIN merge_common_undertaking_units unit ON unit.undertakingUnitId = ri.undertakingUnitId OR unit.undertakingUnitCode = ri.undertakingUnitId OR unit.entityCode = ri.undertakingUnitId
    LEFT JOIN merge_common_suppliers supplier ON supplier.supplierId = ri.supplierId OR supplier.supplierCode = ri.supplierId
    LEFT JOIN merge_common_customers customer ON customer.customerId = ri.customerId OR customer.customerCode = ri.customerId
    LEFT JOIN countries country ON country.code = req.countryCode
    WHERE ${conditions.join(" AND ")}
  `;
  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total ${sourceFrom}`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const [purchaseLines, contractRows] = await Promise.all([
    queryRows<PurchaseLineRow>(
      `
        SELECT
          poi.id AS purchaseOrderItemId,
          req.countryCode,
          req.batchName,
          COALESCE(poi.requestNo, po.requestNo, ri.requestNo) AS requestNo,
          poi.poNo,
           ri.deviceCode,
           COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType,
          im.modelCode,
          im.nameEn,
          ri.supplierId,
          ri.undertakingUnitId,
          ri.customerId,
          ri.quantity,
          po.currency AS actualCurrency,
          poi.unitPrice AS actualUnitPrice,
          COALESCE(poi.taxExcludedUnitPrice, poi.unitPrice, 0) AS taxExcludedUnitPrice,
          COALESCE(poi.taxSurcharge, 0) AS taxSurcharge,
          COALESCE(country.vatRate, 0) AS vatRate,
          po.status AS purchaseStatus,
          req.status AS requestStatus
        ${sourceFrom}
        ${requestedSort || "ORDER BY CASE WHEN TRIM(COALESCE(req.batchName, '')) REGEXP '^[A-Za-z]+[[:space:]]*-[[:space:]]*[0-9]+$' THEN 0 ELSE 1 END, CAST(SUBSTRING_INDEX(TRIM(req.batchName), '-', -1) AS UNSIGNED) DESC, UPPER(TRIM(SUBSTRING_INDEX(TRIM(req.batchName), '-', 1))) ASC, req.countryCode ASC, poi.id"}
        LIMIT :limit OFFSET :offset
      `,
      { ...params, limit: pageSize, offset: (page - 1) * pageSize },
    ),
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
  const availableLines = purchaseLines.map((line) => {
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
  return { rows: await attachPartyCodes(availableLines), total, page, pageSize, totalPages };
}

export async function listAvailableBillingLineFilterOptions(searchParams: URLSearchParams) {
  const expressions: Record<string, string> = {
    countryCode: "req.countryCode", batchName: "req.batchName", requestNo: "COALESCE(poi.requestNo, po.requestNo, ri.requestNo)",
    poNo: "poi.poNo", deviceCode: "ri.deviceCode", requestType: "COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机')",
    modelCode: "im.modelCode", nameEn: "im.nameEn", quantity: "ri.quantity", actualCurrency: "po.currency",
    actualUnitPrice: "poi.unitPrice", taxExcludedUnitPrice: "COALESCE(poi.taxExcludedUnitPrice, poi.unitPrice, 0)", taxSurcharge: "COALESCE(poi.taxSurcharge, 0)",
    undertakingUnitCode: "COALESCE(NULLIF(unit.shortName, ''), NULLIF(unit.entityName, ''), NULLIF(unit.name, ''), unit.undertakingUnitCode)",
    supplierCode: "COALESCE(NULLIF(supplier.shortName, ''), NULLIF(supplier.nameCn, ''), supplier.supplierCode)",
    customerCode: "COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), customer.customerCode)",
  };
  return listSqlFilterOptions({
    expressions,
    searchParams,
    from: `purchaseorderitems poi
      LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
      LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
      LEFT JOIN merge_common_undertaking_units unit ON unit.undertakingUnitId = ri.undertakingUnitId OR unit.undertakingUnitCode = ri.undertakingUnitId OR unit.entityCode = ri.undertakingUnitId
      LEFT JOIN merge_common_suppliers supplier ON supplier.supplierId = ri.supplierId OR supplier.supplierCode = ri.supplierId
      LEFT JOIN merge_common_customers customer ON customer.customerId = ri.customerId OR customer.customerCode = ri.customerId`,
    conditions: [
      "po.status LIKE :availablePurchaseStatus",
      "req.status <> :availableRequestDraftStatus",
      "NOT EXISTS (SELECT 1 FROM billinginstanceledgers occupied WHERE occupied.purchaseOrderItemId = poi.id)",
      "COALESCE(NULLIF(poi.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') <> :availableSparePartType",
    ],
    params: { availablePurchaseStatus: "%确认%", availableRequestDraftStatus: "草稿", availableSparePartType: "备件" },
  });
}

export async function confirmBillingLedgers({
  lines,
}: {
  lines: Array<{ purchaseOrderItemId: string; startMonth: string; instanceContractNo?: string }>;
}) {
  const availableLines = await listAvailableBillingLines({ purchaseOrderItemIds: lines.map((line) => line.purchaseOrderItemId), pageSize: Math.max(lines.length, 1) });
  const lineById = new Map(availableLines.rows.map((line) => [line.purchaseOrderItemId, line]));
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
    await regenerateInternalServiceLedger(ledger.ledgerId);
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
  await regenerateInternalServiceLedger(updated.ledgerId);

  return getBillingLedgerDraft(ledgerId);
}

export async function deleteBillingLedger(ledgerId: string) {
  await execute("DELETE FROM internalservicefeeadjustments WHERE ledgerId = :ledgerId", { ledgerId });
  await execute("DELETE FROM monthlyinternalservicefees WHERE ledgerId = :ledgerId", { ledgerId });
  await execute("DELETE FROM internalserviceledgers WHERE ledgerId = :ledgerId", { ledgerId });
  await execute("DELETE FROM monthlybillingwriteoffs WHERE ledgerId = :ledgerId", { ledgerId });
  await execute("DELETE FROM billinginstanceledgers WHERE ledgerId = :ledgerId", { ledgerId });
}

export async function listMonthlyBillingWriteOffs(searchParams: URLSearchParams) {
  await ensureMonthlyBillingRows();
  const keyword = searchParams.get("keyword")?.trim();
  const countryCode = searchParams.get("countryCode")?.trim();
  const batchName = searchParams.get("batchName")?.trim();
  const requestType = searchParams.get("requestType")?.trim();
  const startMonth = searchParams.get("startMonth")?.trim();
  const endMonth = searchParams.get("endMonth")?.trim();
  const exportAll = searchParams.get("export") === "1";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  const whereParts: string[] = [];
  const params: Row = {};
  const requestTypeExpression = monthlyBillingRequestTypeExpression();
  const supplierNameExpression = monthlyBillingPartyNameExpression("supplier");
  const undertakingUnitNameExpression = monthlyBillingPartyNameExpression("undertakingUnit");
  const customerNameExpression = monthlyBillingPartyNameExpression("customer");
  const filterExpressions: Record<string, string> = {
    writeOffMonth: formatTableDateExpression("mbw.writeOffMonth"), countryCode: "mbw.countryCode", batchName: "mbw.batchName",
    requestNo: "mbw.requestNo", poNo: "mbw.poNo", deviceCode: "mbw.deviceCode", requestType: requestTypeExpression,
    modelCode: "mbw.modelCode", nameEn: "mbw.nameEn", quantity: "mbw.quantity", instanceContractNo: "mbw.instanceContractNo",
    currency: "mbw.currency", monthlyAmount: "mbw.monthlyAmount", monthlyTotalAmount: "mbw.monthlyTotalAmount",
    stage: "mbw.stage", sourceType: "mbw.sourceType", adjustmentNo: "mbw.adjustmentNo",
    undertakingUnitName: undertakingUnitNameExpression, supplierName: supplierNameExpression, customerName: customerNameExpression,
  };
  for (const [field, expression] of Object.entries(filterExpressions)) appendTableInFilter(whereParts, params, expression, field, searchParams, "monthlyBilling");

  if (keyword) {
    whereParts.push(
      `(mbw.ledgerId LIKE :keyword OR mbw.countryCode LIKE :keyword OR mbw.batchName LIKE :keyword OR mbw.requestNo LIKE :keyword OR mbw.poNo LIKE :keyword OR mbw.deviceCode LIKE :keyword OR mbw.nameEn LIKE :keyword OR mbw.instanceContractNo LIKE :keyword)`,
    );
    params.keyword = `%${keyword}%`;
  }
  if (countryCode) {
    whereParts.push("mbw.countryCode = :countryCode");
    params.countryCode = countryCode;
  }
  if (batchName) {
    whereParts.push("mbw.batchName = :batchName");
    params.batchName = batchName;
  }
  if (requestType) {
    whereParts.push(`${requestTypeExpression} = :requestType`);
    params.requestType = requestType;
  }
  if (startMonth) {
    whereParts.push("mbw.writeOffMonth >= :startMonth");
    params.startMonth = firstDayOfMonth(startMonth);
  }
  if (endMonth) {
    whereParts.push("mbw.writeOffMonth <= :endMonth");
    params.endMonth = firstDayOfMonth(endMonth);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const knownTotal = getKnownTotal(searchParams);
  const knownTotalAmount = getKnownNumber(searchParams, "knownTotalAmount");
  let normalizedTotal = knownTotal ?? 0;
  let normalizedTotalAmount = knownTotalAmount ?? 0;
  if (knownTotal === null || knownTotalAmount === null) {
    const [{ total, totalAmount }] = await queryRows<{ total: number; totalAmount: number }>(
      `
        SELECT COUNT(*) AS total, COALESCE(SUM(mbw.monthlyTotalAmount), 0) AS totalAmount
        FROM monthlybillingwriteoffs AS mbw
        LEFT JOIN billinginstanceledgers AS ledger ON ledger.ledgerId = mbw.ledgerId
        LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
        LEFT JOIN requestitems AS ri ON ri.id = purchaseItem.requestItemId
        LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), mbw.requestNo)
        LEFT JOIN requestitems AS riByBusinessKey ON riByBusinessKey.requestNo = mbw.requestNo AND riByBusinessKey.deviceCode = mbw.deviceCode
        ${where}
      `,
      params,
    );
    normalizedTotal = knownTotal ?? Number(total ?? 0);
    normalizedTotalAmount = knownTotalAmount ?? Number(totalAmount ?? 0);
  }
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);
  if (!exportAll) {
    params.limit = pageSize;
    params.offset = (page - 1) * pageSize;
  }
  const rows = await queryRows<Row>(
    `
      SELECT
        mbw.id,
        mbw.ledgerId,
        DATE_FORMAT(mbw.writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        mbw.monthIndex,
        mbw.stage,
        mbw.countryCode,
        mbw.batchName,
        mbw.requestNo,
        mbw.poNo,
        mbw.deviceCode,
        ${requestTypeExpression} AS requestType,
        mbw.modelCode,
        mbw.nameEn,
        COALESCE(NULLIF(mbw.supplierId, ''), ri.supplierId, riByBusinessKey.supplierId) AS supplierId,
        COALESCE(NULLIF(mbw.undertakingUnitId, ''), ri.undertakingUnitId, riByBusinessKey.undertakingUnitId) AS undertakingUnitId,
        COALESCE(NULLIF(mbw.customerId, ''), ri.customerId, riByBusinessKey.customerId) AS customerId,
        mbw.quantity,
        purchaseItem.purchaseOrderId,
        mbw.instanceContractNo,
        mbw.currency,
        mbw.monthlyTotalAmount,
        mbw.monthlyAmount,
        mbw.selfCalculatedUnitPrice,
        mbw.differenceUnitPrice,
        mbw.differenceTotalPrice,
        mbw.sourceType,
        mbw.adjustmentNo,
        DATE_FORMAT(mbw.createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(mbw.updatedAt, '%Y-%m-%d') AS updatedAt
      FROM monthlybillingwriteoffs AS mbw
      LEFT JOIN billinginstanceledgers AS ledger ON ledger.ledgerId = mbw.ledgerId
      LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
      LEFT JOIN requestitems AS ri ON ri.id = purchaseItem.requestItemId
      LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), mbw.requestNo)
      LEFT JOIN requestitems AS riByBusinessKey ON riByBusinessKey.requestNo = mbw.requestNo AND riByBusinessKey.deviceCode = mbw.deviceCode
      ${where}
      ${getTableSort(searchParams, filterExpressions) || "ORDER BY mbw.writeOffMonth DESC, mbw.ledgerId"}
      ${exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  return {
    rows: await attachPartyCodes(rows),
    total: normalizedTotal,
    totalAmount: normalizedTotalAmount,
    page: exportAll ? 1 : page,
    pageSize,
    totalPages,
  };
}

const MONTHLY_BILLING_TOTAL_MONTHS = 60;

/**
 * Older imports could create billing ledgers without their derived monthly rows.
 * Fill only missing deterministic rows so the monthly ledger and service-fee
 * calculations can use the same source data as newly confirmed ledgers.
 */
export async function ensureMonthlyBillingRows() {
  const ledgers = await queryRows<BillingLedgerDraft & { monthlyRowCount: number; hasConfirmedAdjustment: number }>(
    `
      SELECT
        billing.ledgerId,
        billing.purchaseOrderItemId,
        billing.countryCode,
        billing.batchName,
        billing.requestNo,
        billing.poNo,
        billing.deviceCode,
        COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType,
        billing.modelCode,
        billing.nameEn,
        billing.supplierId,
        billing.undertakingUnitId,
        billing.customerId,
        billing.quantity,
        billing.actualCurrency,
        billing.actualUnitPrice,
        billing.taxExcludedUnitPrice,
        billing.taxSurcharge,
        billing.vatRate,
        billing.selfCalculatedUnitPrice,
        billing.instanceContractNo,
        billing.contractCurrency,
        billing.first24MonthPrice,
        billing.next36MonthPrice,
        billing.differenceUnitPrice,
        billing.differenceTotalPrice,
        DATE_FORMAT(billing.startMonth, '%Y-%m-%d') AS startMonth,
        billing.status,
        COALESCE(monthly.rowCount, 0) AS monthlyRowCount,
        EXISTS (
          SELECT 1
          FROM billingadjustments AS adjustment
          INNER JOIN billingadjustmentitems AS adjustmentItem ON adjustmentItem.adjustmentNo = adjustment.adjustmentNo
          WHERE adjustment.confirmedAt IS NOT NULL
            AND adjustmentItem.countryCode = billing.countryCode
            AND adjustmentItem.batchName = billing.batchName
            AND (adjustmentItem.requestNo = billing.requestNo OR adjustmentItem.requestNo = '')
            AND adjustmentItem.deviceCode = billing.deviceCode
        ) AS hasConfirmedAdjustment
      FROM billinginstanceledgers AS billing
      LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = billing.purchaseOrderItemId
      LEFT JOIN requestitems AS ri ON ri.id = purchaseItem.requestItemId
      LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), billing.requestNo)
      LEFT JOIN (
        SELECT ledgerId, COUNT(*) AS rowCount
        FROM monthlybillingwriteoffs
        GROUP BY ledgerId
      ) AS monthly ON monthly.ledgerId = billing.ledgerId
      WHERE COALESCE(monthly.rowCount, 0) < :totalMonths
         OR EXISTS (
              SELECT 1
              FROM billingadjustments AS adjustment
              INNER JOIN billingadjustmentitems AS adjustmentItem ON adjustmentItem.adjustmentNo = adjustment.adjustmentNo
              WHERE adjustment.confirmedAt IS NOT NULL
                AND adjustmentItem.countryCode = billing.countryCode
                AND adjustmentItem.batchName = billing.batchName
                AND (adjustmentItem.requestNo = billing.requestNo OR adjustmentItem.requestNo = '')
                AND adjustmentItem.deviceCode = billing.deviceCode
            )
      ORDER BY billing.ledgerId
    `,
    { totalMonths: MONTHLY_BILLING_TOTAL_MONTHS },
  );
  if (!ledgers.length) return { ledgerCount: 0, rowCount: 0 };

  const rows: MonthlyBillingRow[] = [];
  for (const ledger of ledgers) {
    const generatedRows = await buildMonthlyBillingRowsWithConfirmedAdjustments(ledger);
    if (Number(ledger.monthlyRowCount ?? 0) >= MONTHLY_BILLING_TOTAL_MONTHS && Number(ledger.hasConfirmedAdjustment ?? 0) === 1) {
      const existingRows = await queryRows<Row>(
        `
          SELECT monthIndex, DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth, instanceContractNo, currency,
            monthlyAmount, monthlyTotalAmount, differenceUnitPrice, differenceTotalPrice, sourceType, adjustmentNo
          FROM monthlybillingwriteoffs
          WHERE ledgerId = :ledgerId
        `,
        { ledgerId: ledger.ledgerId },
      );
      if (!monthlyBillingRowsMatch(existingRows, generatedRows)) await replaceMonthlyBillingRows(ledger.ledgerId, generatedRows);
    } else {
      rows.push(...generatedRows);
    }
  }

  await withTransaction(async (connection) => {
    for (let offset = 0; offset < rows.length; offset += 500) {
      const chunk = rows.slice(offset, offset + 500);
      const columns = [
        "id", "ledgerId", "writeOffMonth", "monthIndex", "stage", "countryCode", "batchName", "requestNo",
        "poNo", "deviceCode", "modelCode", "nameEn", "supplierId", "undertakingUnitId", "customerId", "quantity",
        "instanceContractNo", "currency", "monthlyAmount", "monthlyTotalAmount", "selfCalculatedUnitPrice",
        "differenceUnitPrice", "differenceTotalPrice", "sourceType", "adjustmentNo",
      ];
      const values = chunk.map((_, index) => `(${columns.map((column) => `:${column}_${index}`).join(", ")})`).join(", ");
      const params = Object.fromEntries(
        chunk.flatMap((row, index) => columns.map((column) => [`${column}_${index}`, row[column as keyof MonthlyBillingRow] ?? null])),
      );
      await executeInTransaction(
        connection,
        `INSERT IGNORE INTO monthlybillingwriteoffs (${columns.join(", ")}) VALUES ${values}`,
        params,
      );
    }
  });

  return { ledgerCount: ledgers.length, rowCount: rows.length };
}

function monthlyBillingRowsMatch(existingRows: Row[], generatedRows: MonthlyBillingRow[]) {
  if (existingRows.length !== generatedRows.length) return false;
  const existingByMonth = new Map(existingRows.map((row) => [Number(row.monthIndex), row]));
  return generatedRows.every((generated) => {
    const existing = existingByMonth.get(generated.monthIndex);
    if (!existing) return false;
    return String(existing.writeOffMonth ?? "").slice(0, 10) === generated.writeOffMonth
      && String(existing.instanceContractNo ?? "") === generated.instanceContractNo
      && String(existing.currency ?? "") === generated.currency
      && Number(existing.monthlyAmount ?? 0) === generated.monthlyAmount
      && Number(existing.monthlyTotalAmount ?? 0) === generated.monthlyTotalAmount
      && Number(existing.differenceUnitPrice ?? 0) === generated.differenceUnitPrice
      && Number(existing.differenceTotalPrice ?? 0) === generated.differenceTotalPrice
      && String(existing.sourceType ?? "") === generated.sourceType
      && String(existing.adjustmentNo ?? "") === generated.adjustmentNo;
  });
}

function monthlyBillingRequestTypeExpression() {
  return "COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), NULLIF(riByBusinessKey.requestType, ''), '整机')";
}

function monthlyBillingPartyNameExpression(party: "supplier" | "undertakingUnit" | "customer") {
  const ids = party === "supplier"
    ? "COALESCE(NULLIF(mbw.supplierId, ''), ri.supplierId, riByBusinessKey.supplierId)"
    : party === "undertakingUnit"
      ? "COALESCE(NULLIF(mbw.undertakingUnitId, ''), ri.undertakingUnitId, riByBusinessKey.undertakingUnitId)"
      : "COALESCE(NULLIF(mbw.customerId, ''), ri.customerId, riByBusinessKey.customerId)";
  const table = party === "supplier" ? "merge_common_suppliers" : party === "undertakingUnit" ? "merge_common_undertaking_units" : "merge_common_customers";
  const idColumn = party === "supplier" ? "supplierId" : party === "undertakingUnit" ? "undertakingUnitId" : "customerId";
  const codeColumn = party === "supplier" ? "supplierCode" : party === "undertakingUnit" ? "undertakingUnitCode" : "customerCode";
  const fullNameColumn = party === "supplier" ? "nameCn" : party === "undertakingUnit" ? "entityName" : "nameCn";
  return `(SELECT COALESCE(NULLIF(party.shortName, ''), NULLIF(party.${fullNameColumn}, ''), party.${codeColumn}) FROM ${table} party WHERE party.${idColumn} = ${ids} OR party.${codeColumn} = ${ids} LIMIT 1)`;
}

export async function listMonthlyBillingWriteOffFilterOptions(searchParams: URLSearchParams) {
  const expressions: Record<string, string> = {
    writeOffMonth: formatTableDateExpression("mbw.writeOffMonth"), countryCode: "mbw.countryCode", batchName: "mbw.batchName", requestNo: "mbw.requestNo", poNo: "mbw.poNo",
    deviceCode: "mbw.deviceCode", requestType: monthlyBillingRequestTypeExpression(), modelCode: "mbw.modelCode", nameEn: "mbw.nameEn", quantity: "mbw.quantity",
    instanceContractNo: "mbw.instanceContractNo", currency: "mbw.currency", monthlyAmount: "mbw.monthlyAmount", monthlyTotalAmount: "mbw.monthlyTotalAmount",
    stage: "mbw.stage", sourceType: "mbw.sourceType", adjustmentNo: "mbw.adjustmentNo",
    undertakingUnitName: monthlyBillingPartyNameExpression("undertakingUnit"), supplierName: monthlyBillingPartyNameExpression("supplier"), customerName: monthlyBillingPartyNameExpression("customer"),
  };
  return listTableOptions("", expressions, searchParams, `
    monthlybillingwriteoffs AS mbw
    LEFT JOIN billinginstanceledgers AS ledger ON ledger.ledgerId = mbw.ledgerId
    LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
    LEFT JOIN requestitems AS ri ON ri.id = purchaseItem.requestItemId
    LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), mbw.requestNo)
    LEFT JOIN requestitems AS riByBusinessKey ON riByBusinessKey.requestNo = mbw.requestNo AND riByBusinessKey.deviceCode = mbw.deviceCode
  `);
}

async function listTableOptions(table: string, expressions: Record<string, string>, searchParams: URLSearchParams, from = table) {
  const field = searchParams.get("field")?.trim() ?? "";
  const expression = expressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };
  const params: Row = {};
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  const where = [`${expression} IS NOT NULL`, `TRIM(CAST(${expression} AS CHAR)) <> ''`];
  if (keyword) { where.push(`${expression} LIKE :optionKeyword`); params.optionKeyword = `%${keyword}%`; }
  appendTableFilterOptionConditions(where, params, expressions, searchParams, field);
  const rows = await queryRows<{ value: string; count: number }>(
    `SELECT optionValues.value, COUNT(*) AS count
       FROM (SELECT ${expression} AS value FROM ${from} WHERE ${where.join(" AND ")}) AS optionValues
      GROUP BY optionValues.value
      ORDER BY ${getTableFilterOptionsOrderBy(field, "optionValues.value")}
      LIMIT 500`,
    params,
  );
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
}

export async function confirmBillingAdjustment(adjustmentNo: string) {
  const { adjustment, items } = await getBillingAdjustment(adjustmentNo);
  if (!adjustment) throw new Error("调整单不存在");
  if (!items.length) throw new Error("调整单明细不能为空");

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

  if (String(adjustment.status) !== "已确认") {
    await execute(
      `
        UPDATE billingadjustments
        SET status = '已确认',
            confirmedAt = CURRENT_TIMESTAMP
        WHERE adjustmentNo = :adjustmentNo
      `,
      { adjustmentNo },
    );
  }

  for (const ledgerId of ledgerIds) {
    const ledger = await getBillingLedgerDraft(ledgerId);
    if (ledger) {
      await replaceMonthlyBillingRows(ledgerId, await buildMonthlyBillingRowsWithConfirmedAdjustments(ledger));
      await regenerateInternalServiceLedger(ledgerId);
    }
  }

  return { adjustmentNo, updatedLedgers: ledgerIds.size };
}

async function insertBillingLedger(ledger: BillingLedgerDraft) {
  await execute(
    `
      INSERT INTO billinginstanceledgers
        (ledgerId, purchaseOrderItemId, countryCode, batchName, requestNo, poNo, deviceCode,
          modelCode, nameEn, supplierId, undertakingUnitId, customerId, quantity, actualCurrency, actualUnitPrice,
         taxExcludedUnitPrice, taxSurcharge, vatRate, selfCalculatedUnitPrice, instanceContractNo,
         contractCurrency, first24MonthPrice, next36MonthPrice, differenceUnitPrice, differenceTotalPrice,
         startMonth, status, confirmedAt)
        VALUES
          (:ledgerId, :purchaseOrderItemId, :countryCode, :batchName, :requestNo, :poNo, :deviceCode,
          :modelCode, :nameEn, :supplierId, :undertakingUnitId, :customerId, :quantity, :actualCurrency, :actualUnitPrice,
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
        COALESCE(NULLIF(purchaseItem.requestType, ''), NULLIF(ri.requestType, ''), NULLIF(req.requestType, ''), '整机') AS requestType,
        modelCode,
        nameEn,
        supplierId,
        undertakingUnitId,
        customerId,
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
      LEFT JOIN purchaseorderitems AS purchaseItem ON purchaseItem.id = billinginstanceledgers.purchaseOrderItemId
      LEFT JOIN requestitems AS ri ON ri.id = purchaseItem.requestItemId
      LEFT JOIN requests AS req ON req.requestNo = COALESCE(NULLIF(purchaseItem.requestNo, ''), NULLIF(ri.requestNo, ''), billinginstanceledgers.requestNo)
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
           poNo, deviceCode, modelCode, nameEn, supplierId, undertakingUnitId, customerId, quantity,
           instanceContractNo, currency, monthlyAmount, monthlyTotalAmount, selfCalculatedUnitPrice,
           differenceUnitPrice, differenceTotalPrice, sourceType, adjustmentNo)
        VALUES
          (:id, :ledgerId, :writeOffMonth, :monthIndex, :stage, :countryCode, :batchName, :requestNo,
           :poNo, :deviceCode, :modelCode, :nameEn, :supplierId, :undertakingUnitId, :customerId, :quantity,
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
