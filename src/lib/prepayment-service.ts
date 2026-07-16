import { execute, queryRows, type Row } from "./db";
import { isConfirmedOrderStatus } from "./order-status";
import {
  buildMonthlyWriteOffRows,
  buildPrepaymentDraft,
  filterAvailablePrepaymentLines,
  firstDayOfMonth,
  type MonthlyWriteOffSourceLine,
  type PrepaymentContractLineDraft,
  type PrepaymentPurchaseLine,
} from "./prepayment-workflow";

type PurchaseLineRow = PrepaymentPurchaseLine & {
  purchaseStatus?: string | null;
  requestStatus?: string | null;
};

type PrepaymentLineRow = PrepaymentContractLineDraft & {
  status?: string | null;
};

export async function listAvailablePrepaymentLines() {
  const purchaseLines = await queryRows<PurchaseLineRow>(
    `
      SELECT
        poi.id,
        poi.poNo,
        COALESCE(poi.requestNo, po.requestNo, ri.requestNo) AS requestNo,
        req.countryCode,
        req.batchName,
        poi.requestItemId,
        ri.deviceCode,
        im.modelCode,
        im.nameEn,
        ri.supplierId,
        ri.undertakingUnitId,
        ri.quantity,
        po.currency,
        poi.unitPrice,
        po.status AS purchaseStatus,
        req.status AS requestStatus
      FROM purchaseorderitems poi
      LEFT JOIN purchaseorders po ON po.purchaseOrderId = poi.purchaseOrderId OR (poi.purchaseOrderId IS NULL AND po.poNo = poi.poNo)
      LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
      LEFT JOIN requests req ON req.requestNo = COALESCE(poi.requestNo, po.requestNo, ri.requestNo)
      LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
      ORDER BY req.batchName, po.poNo, poi.id
    `,
  );
  const occupiedRows = await queryRows<{ purchaseOrderItemId: string }>(
    `
      SELECT pci.purchaseOrderItemId
      FROM prepaymentcontractitems pci
      INNER JOIN prepaymentcontracts pc ON pc.contractNo = pci.contractNo
      WHERE pci.purchaseOrderItemId IS NOT NULL
        AND pc.status IN ('草稿', '已确认')
    `,
  );
  const confirmedLines = purchaseLines.filter(
    (line) =>
      isConfirmedOrderStatus("purchase", line.purchaseStatus) &&
      isConfirmedOrderStatus("requests", line.requestStatus),
  );

  return filterAvailablePrepaymentLines({
    purchaseLines: confirmedLines,
    occupiedPurchaseOrderItemIds: occupiedRows.map((row) => String(row.purchaseOrderItemId)),
  });
}

export async function createPrepaymentDraft({
  contractNo,
  effectiveDate,
  purchaseOrderItemIds,
}: {
  contractNo: string;
  effectiveDate: string;
  purchaseOrderItemIds: string[];
}) {
  const availableLines = await listAvailablePrepaymentLines();
  const selected = availableLines.filter((line) => purchaseOrderItemIds.includes(line.id));
  if (!contractNo.trim()) throw new Error("预付款合同号不能为空");
  if (!selected.length) throw new Error("请选择可生成预付款合同的实例");

  const draft = buildPrepaymentDraft({
    contractNo,
    effectiveDate: firstDayOfMonth(effectiveDate),
    purchaseLines: selected,
  });

  await execute(
    `
      INSERT INTO prepaymentcontracts
        (contractNo, status, currency, effectiveDate, totalAmount)
      VALUES
        (:contractNo, :status, :currency, :effectiveDate, :totalAmount)
    `,
    draft.contract,
  );

  for (const line of draft.lines) {
    await insertPrepaymentLine(line);
  }

  return draft.contract;
}

export async function getPrepaymentContract(contractNo: string) {
  const contracts = await queryRows<Row>(
    `
      SELECT
        contractNo,
        status,
        currency,
        DATE_FORMAT(effectiveDate, '%Y-%m-%d') AS effectiveDate,
        totalAmount,
        confirmedAt,
        createdAt,
        updatedAt
      FROM prepaymentcontracts
      WHERE contractNo = :contractNo
      LIMIT 1
    `,
    { contractNo },
  );
  const contract = contracts[0] ?? null;
  const lines = contract
    ? await queryRows<PrepaymentLineRow>(
        `
          SELECT
            contractItem.id,
            contractItem.contractNo,
            contractItem.lineType,
            contractItem.purchaseOrderItemId,
            contractItem.requestItemId,
            contractItem.countryCode,
            contractItem.batchName,
            contractItem.requestNo,
            contractItem.poNo,
            contractItem.deviceCode,
            contractItem.modelCode,
            contractItem.nameEn AS nameEn,
            COALESCE(NULLIF(contractItem.supplierId, ''), ri.supplierId) AS supplierId,
            COALESCE(NULLIF(contractItem.undertakingUnitId, ''), ri.undertakingUnitId) AS undertakingUnitId,
            contractItem.quantity,
            contractItem.actualCurrency,
            contractItem.actualUnitPrice,
            contractItem.actualTotalAmount,
            contractItem.contractCurrency,
            contractItem.contractUnitPrice,
            contractItem.contractTotalAmount,
            DATE_FORMAT(contractItem.writeOffStartMonth, '%Y-%m-%d') AS writeOffStartMonth,
            contractItem.feeName,
            contractItem.feeDescription
          FROM prepaymentcontractitems AS contractItem
          LEFT JOIN requestitems AS ri ON ri.id = contractItem.requestItemId
          WHERE contractItem.contractNo = :contractNo
          ORDER BY contractItem.id
        `,
        { contractNo },
      )
    : [];

  return { contract, lines };
}

export async function updatePrepaymentDraft({
  contractNo,
  effectiveDate,
  lines,
}: {
  contractNo: string;
  effectiveDate: string;
  lines: PrepaymentContractLineDraft[];
}) {
  const { contract } = await getPrepaymentContract(contractNo);
  if (!contract) throw new Error("预付款合同不存在");
  if (String(contract.status) !== "草稿") throw new Error("已确认的预付款合同不可修改");

  const normalizedLines = lines.map((line, index) => ({
    ...line,
    id: line.id || `PPCI-${contractNo}-${String(index + 1).padStart(3, "0")}`,
    contractNo,
    writeOffStartMonth: firstDayOfMonth(line.writeOffStartMonth || effectiveDate),
    contractTotalAmount: Number(line.contractTotalAmount ?? 0),
    contractUnitPrice: Number(line.contractUnitPrice ?? 0),
  }));
  const totalAmount = roundMoney(
    normalizedLines.reduce((total, line) => total + Number(line.contractTotalAmount ?? 0), 0),
  );
  const currency = normalizedLines[0]?.contractCurrency ?? String(contract.currency ?? "USD");

  await execute(
    `
      UPDATE prepaymentcontracts
      SET effectiveDate = :effectiveDate,
          currency = :currency,
          totalAmount = :totalAmount
      WHERE contractNo = :contractNo
    `,
    { contractNo, effectiveDate: firstDayOfMonth(effectiveDate), currency, totalAmount },
  );
  await execute("DELETE FROM prepaymentcontractitems WHERE contractNo = :contractNo", { contractNo });
  for (const line of normalizedLines) {
    await insertPrepaymentLine(line);
  }

  return getPrepaymentContract(contractNo);
}

export async function deletePrepaymentDraft(contractNo: string) {
  const { contract } = await getPrepaymentContract(contractNo);
  if (!contract) return;
  if (String(contract.status) !== "草稿") throw new Error("已确认的预付款合同不可删除");

  await execute("DELETE FROM prepaymentcontractitems WHERE contractNo = :contractNo", { contractNo });
  await execute("DELETE FROM prepaymentcontracts WHERE contractNo = :contractNo", { contractNo });
}

export async function confirmPrepaymentContract(contractNo: string) {
  const { contract, lines } = await getPrepaymentContract(contractNo);
  if (!contract) throw new Error("预付款合同不存在");
  if (String(contract.status) === "已确认") return getPrepaymentContract(contractNo);
  if (!lines.length) throw new Error("预付款合同明细不能为空");

  const writeOffRows = buildMonthlyWriteOffRows(lines as MonthlyWriteOffSourceLine[]);
  await execute("DELETE FROM monthlyprepaymentwriteoffs WHERE contractNo = :contractNo", { contractNo });
  for (const row of writeOffRows) {
    await execute(
      `
        INSERT INTO monthlyprepaymentwriteoffs
          (id, contractNo, contractLineId, writeOffMonth, monthIndex, totalMonths, currency,
           originalAmount, monthlyAmount, lineType, countryCode, batchName, requestNo, poNo, deviceCode,
           modelCode, nameEn, supplierId, undertakingUnitId, quantity)
        VALUES
          (:id, :contractNo, :contractLineId, :writeOffMonth, :monthIndex, :totalMonths, :currency,
           :originalAmount, :monthlyAmount, :lineType, :countryCode, :batchName, :requestNo, :poNo, :deviceCode,
           :modelCode, :nameEn, :supplierId, :undertakingUnitId, :quantity)
      `,
      row,
    );
  }
  await execute(
    `
      UPDATE prepaymentcontracts
      SET status = '已确认',
          confirmedAt = CURRENT_TIMESTAMP
      WHERE contractNo = :contractNo
    `,
    { contractNo },
  );

  return getPrepaymentContract(contractNo);
}

export async function listMonthlyPrepaymentWriteOffs(searchParams: URLSearchParams) {
  const keyword = searchParams.get("keyword")?.trim();
  const countryCode = searchParams.get("countryCode")?.trim();
  const batchName = searchParams.get("batchName")?.trim();
  const startMonth = searchParams.get("startMonth")?.trim();
  const endMonth = searchParams.get("endMonth")?.trim();
  const whereParts: string[] = [];
  const params: Row = {};

  if (keyword) {
    whereParts.push(
      `(contractNo LIKE :keyword OR countryCode LIKE :keyword OR batchName LIKE :keyword OR requestNo LIKE :keyword OR poNo LIKE :keyword OR deviceCode LIKE :keyword OR nameEn LIKE :keyword)`,
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
        contractNo,
        contractLineId,
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        monthIndex,
        totalMonths,
        currency,
        originalAmount,
        monthlyAmount,
        lineType,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        nameEn,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.supplierId, ''), ri.supplierId, riByBusinessKey.supplierId) AS supplierId,
        COALESCE(NULLIF(monthlyprepaymentwriteoffs.undertakingUnitId, ''), ri.undertakingUnitId, riByBusinessKey.undertakingUnitId) AS undertakingUnitId,
        quantity,
        sourceType,
        adjustmentNo,
        createdAt
      FROM monthlyprepaymentwriteoffs
      LEFT JOIN prepaymentcontractitems AS contractItem ON contractItem.id = monthlyprepaymentwriteoffs.contractLineId
      LEFT JOIN requestitems AS ri ON ri.id = contractItem.requestItemId
      LEFT JOIN requestitems AS riByBusinessKey
        ON riByBusinessKey.requestNo = monthlyprepaymentwriteoffs.requestNo
        AND riByBusinessKey.deviceCode = monthlyprepaymentwriteoffs.deviceCode
      ${where}
      ORDER BY writeOffMonth DESC, contractNo, contractLineId
    `,
    params,
  );

  return { rows, total: rows.length };
}

async function insertPrepaymentLine(line: PrepaymentContractLineDraft) {
  await execute(
    `
      INSERT INTO prepaymentcontractitems
        (id, contractNo, lineType, purchaseOrderItemId, requestItemId, countryCode, batchName, requestNo, poNo,
         deviceCode, modelCode, nameEn, supplierId, undertakingUnitId, quantity, actualCurrency, actualUnitPrice, actualTotalAmount,
         contractCurrency, contractUnitPrice, contractTotalAmount, writeOffStartMonth, feeName, feeDescription,
         prepaymentAmount, currency)
      VALUES
        (:id, :contractNo, :lineType, :purchaseOrderItemId, :requestItemId, :countryCode, :batchName, :requestNo, :poNo,
        :deviceCode, :modelCode, :nameEn, :supplierId, :undertakingUnitId, :quantity, :actualCurrency, :actualUnitPrice, :actualTotalAmount,
         :contractCurrency, :contractUnitPrice, :contractTotalAmount, :writeOffStartMonth, :feeName, :feeDescription,
         :contractTotalAmount, :contractCurrency)
    `,
    line,
  );
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
