import { execute, executeInTransaction, queryRows, withTransaction, type Row } from "./db";
import type { PoolConnection } from "mysql2/promise";
import { firstDayOfMonth } from "./prepayment-workflow";
import { isAppendedTailPeriod, WRITE_OFF_MONTHS } from "./prepayment-workflow";
import { appendTableFilterOptionConditions, appendTableInFilter, getTableFilterOptionsOrderBy, getTableSort } from "./table-query";
import {
  buildPrepaymentWriteOffAdjustmentItems,
  type PrepaymentMonthlyWriteOffForAdjustment,
  type PrepaymentWriteOffAdjustmentItemDraft,
} from "./prepayment-adjustment-workflow";

type PrepaymentAdjustmentPayload = {
  adjustmentNo: string;
  reason?: string;
  monthlyWriteOffIds: string[];
  adjustedAmounts: Record<string, number | string>;
};

/** 生成 `YYYY-MM-DD`（按本地日期，避免 toISOString 的时区偏移）。 */
function formatDate(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/**
 * 按合同号列出可追加尾期的明细。
 *
 * "追加尾期"是独立动作，不看当前调整单里加了哪些明细：财务输入合同号后，
 * 这里把该合同每条明细的已核销 / 剩余 / 下一期月份一次算好，前端直接列表选择。
 * 只统计**已生效**金额（草稿调整单不算），与预付款合同的核销状态提醒口径一致。
 */
export async function listAppendableWriteOffMonths(contractNo: string) {
  const value = String(contractNo ?? "").trim();
  if (!value) throw new Error("请输入预付款合同号");
  const lines = await queryRows<Row>(
    `SELECT i.id, i.deviceCode, i.modelCode, i.nameEn, i.contractTotalAmount,
            COALESCE(w.written, 0) AS written,
            w.lastMonth,
            COALESCE(w.lastIndex, 0) AS lastIndex
       FROM prepaymentcontractitems i
       LEFT JOIN (
         SELECT contractLineId, SUM(monthlyAmount) AS written,
                MAX(writeOffMonth) AS lastMonth, MAX(monthIndex) AS lastIndex
           FROM monthlyprepaymentwriteoffs GROUP BY contractLineId
       ) w ON w.contractLineId = i.id
      WHERE i.contractNo = :contractNo
      ORDER BY i.id`,
    { contractNo: value },
  );
  if (!lines.length) throw new Error(`预付款合同 ${value} 不存在或没有明细`);
  const tailRows = await queryRows<Row>(
    `SELECT id, contractLineId, writeOffMonth, monthIndex, monthlyAmount
       FROM monthlyprepaymentwriteoffs
      WHERE contractNo = :contractNo AND monthIndex > :writeOffMonths
      ORDER BY contractLineId, monthIndex`,
    { contractNo: value, writeOffMonths: WRITE_OFF_MONTHS },
  );
  const tailsByLine = new Map<string, Array<Record<string, unknown>>>();
  for (const row of tailRows) {
    const key = String(row.contractLineId ?? "");
    const list = tailsByLine.get(key) ?? [];
    list.push({
      id: String(row.id ?? ""),
      writeOffMonth: formatDate(new Date(String(row.writeOffMonth ?? ""))),
      monthIndex: Number(row.monthIndex ?? 0),
      amount: roundMoney(Number(row.monthlyAmount ?? 0)),
    });
    tailsByLine.set(key, list);
  }
  return lines.map((line) => {
    const lineAmount = roundMoney(Number(line.contractTotalAmount ?? 0));
    const written = roundMoney(Number(line.written ?? 0));
    const remaining = roundMoney(lineAmount - written);
    const base = new Date(String(line.lastMonth ?? new Date()));
    const next = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    return {
      contractLineId: String(line.id ?? ""),
      deviceCode: String(line.deviceCode ?? ""),
      modelCode: String(line.modelCode ?? ""),
      nameEn: String(line.nameEn ?? ""),
      lineAmount,
      written,
      remaining,
      monthIndex: Number(line.lastIndex ?? 0) + 1,
      nextMonth: formatDate(next),
      settled: remaining <= 0,
      tails: tailsByLine.get(String(line.id ?? "")) ?? [],
    };
  });
}

/**
 * 追加尾期：合同明细按默认期数铺满后总额还没核销完时的出口。
 *
 * 场景：客户某个月少核销（甚至核销为 0），明细的核销月份不够用，
 * 而调整单只能改「已存在的月份」，没有位置承接剩下的金额。
 *
 * 默认金额 = **合同明细总额 − 已生成各期实际金额之和**。
 * 调整单确认是就地改写 `monthlyAmount`，所以 `SUM(monthlyAmount)` 就是"实际已核销"，
 * 除不尽产生的零头（尾差）已经包含在前面的实际金额里，追加期只负责补齐差额。
 * 默认月份 = 最后一期往后顺延一个月；金额允许手动改，但各期合计不能超过明细总额。
 */
export async function appendPrepaymentWriteOffMonth(payload: { contractLineId: string; month?: string; amount?: number }) {
  const contractLineId = String(payload.contractLineId ?? "").trim();
  if (!contractLineId) throw new Error("请先选择合同明细");

  const [line] = await queryRows<Row>(
    `SELECT line.id, line.contractNo, line.contractTotalAmount, line.currency, line.contractCurrency, line.writeOffStartMonth,
            line.lineType, line.requestType, line.countryCode, line.batchName, line.requestNo, line.poNo, line.deviceCode,
            line.modelCode, line.nameEn, line.supplierId, line.undertakingUnitId, line.customerId, line.quantity,
            contract.status AS contractStatus
       FROM prepaymentcontractitems line
       LEFT JOIN prepaymentcontracts contract ON contract.contractNo = line.contractNo
      WHERE line.id = :contractLineId LIMIT 1`,
    { contractLineId },
  );
  if (!line) throw new Error("合同明细不存在");
  /**
   * 只允许给**已确认**的合同追加尾期。
   *
   * 草稿合同确认时会先清空该合同的全部月核销明细再重新生成 24 期，
   * 这时追加的期会被直接覆盖，等于白加；而且草稿合同没有已生成的前 24 期，
   * 追加出来的期号会落在 1~24 里，和合同首次生成的期次分不开（尾期判据失效）。
   */
  if (String(line.contractStatus ?? "") !== "已确认") {
    throw new Error("请先确认预付款合同再追加尾期：草稿合同确认时会重新生成前 24 期，追加的期会被覆盖");
  }

  // 只统计**已生效**金额：草稿调整单可能不确认，算进来会误导（与合同核销状态提醒口径一致）。
  const [existing] = await queryRows<Row>(
    `SELECT COALESCE(SUM(w.monthlyAmount), 0) AS written,
            COALESCE(MAX(w.monthIndex), 0) AS lastIndex,
            MAX(w.writeOffMonth) AS lastMonth
       FROM monthlyprepaymentwriteoffs w
      WHERE w.contractLineId = :contractLineId`,
    { contractLineId },
  );
  const originalAmount = roundMoney(Number(line.contractTotalAmount ?? 0));
  const written = roundMoney(Number(existing?.written ?? 0));
  const remaining = roundMoney(originalAmount - written);
  if (remaining <= 0) throw new Error(`该明细已核销完（总额 ${originalAmount}），无需追加尾期`);

  const amount = payload.amount === undefined || payload.amount === null ? remaining : roundMoney(Number(payload.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(remaining > 0 ? "追加金额必须大于 0" : `该明细已核销完（总额 ${originalAmount}），如需继续核销请手动填写金额`);
  }
  /**
   * 超额**不拦，只提醒**：业务上允许先冲后调、也允许同一合同内明细互相对冲，
   * 与调整单"只提醒不拦截"的口径保持一致；真正的未平由合同列表的核销状态提醒兜底。
   */
  const nextTotal = roundMoney(written + amount);
  const warning =
    nextTotal > originalAmount
      ? `追加后该明细各期合计 ${nextTotal}，已超过明细金额 ${originalAmount} ${roundMoney(nextTotal - originalAmount)}`
      : "";

  const monthIndex = Number(existing?.lastIndex ?? 0) + 1;
  const baseDate = new Date(String(existing?.lastMonth ?? line.writeOffStartMonth ?? new Date()));
  const defaultMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  const writeOffMonth = String(payload.month ?? "").trim() || formatDate(defaultMonth);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(writeOffMonth)) throw new Error("核销月份格式应为 YYYY-MM-DD");

  const id = `MWO-${line.id}-${String(monthIndex).padStart(3, "0")}`;
  await execute(
    `INSERT INTO monthlyprepaymentwriteoffs
       (id, contractNo, contractLineId, writeOffMonth, monthIndex, totalMonths, currency, originalAmount, monthlyAmount,
        lineType, requestType, countryCode, batchName, requestNo, poNo, deviceCode, modelCode, nameEn,
        supplierId, undertakingUnitId, customerId, quantity, sourceType)
     VALUES
       (:id, :contractNo, :contractLineId, :writeOffMonth, :monthIndex, :totalMonths, :currency, :originalAmount, :monthlyAmount,
        :lineType, :requestType, :countryCode, :batchName, :requestNo, :poNo, :deviceCode, :modelCode, :nameEn,
        :supplierId, :undertakingUnitId, :customerId, :quantity, '追加尾期')`,
    {
      id,
      contractNo: String(line.contractNo ?? ""),
      contractLineId,
      writeOffMonth,
      monthIndex,
      totalMonths: monthIndex,
      currency: String(line.currency ?? line.contractCurrency ?? ""),
      originalAmount,
      monthlyAmount: amount,
      lineType: String(line.lineType ?? ""),
      requestType: String(line.requestType ?? ""),
      countryCode: String(line.countryCode ?? ""),
      batchName: String(line.batchName ?? ""),
      requestNo: String(line.requestNo ?? ""),
      poNo: String(line.poNo ?? ""),
      deviceCode: String(line.deviceCode ?? ""),
      modelCode: String(line.modelCode ?? ""),
      nameEn: String(line.nameEn ?? ""),
      supplierId: String(line.supplierId ?? ""),
      undertakingUnitId: String(line.undertakingUnitId ?? ""),
      customerId: String(line.customerId ?? ""),
      quantity: Number(line.quantity ?? 0),
    },
  );
  // 期数变了，同明细已有各期的 totalMonths 一起同步，列表口径才一致。
  await execute(
    "UPDATE monthlyprepaymentwriteoffs SET totalMonths = :monthIndex WHERE contractLineId = :contractLineId",
    { monthIndex, contractLineId },
  );

  return { id, contractLineId, writeOffMonth, monthIndex, amount, remainingBefore: remaining, writtenTotal: nextTotal, originalAmount, warning };
}

/**
 * 删除「追加尾期」生成的一期。
 *
 * 追加尾期是财务手动加的期次，加错了必须能撤：撤掉之后该期从月核销明细消失，
 * 合同的核销状态（实时比对合同金额与已生效核销合计）会自动重新计算。
 *
 * 边界（按业务确认的口径）：
 * - **只允许删「追加尾期」产生的期**，判据是"期号 > 默认期数(24)"而不是 `sourceType`：
 *   调整单确认会把来源改成「调整单」、退回草稿又会重置成「首次生成」，来源字段会被覆盖，
 *   拿它判断会出现"明明是追加来的期，却因为来源被改而删不掉"的死结。
 *   合同确认只会生成第 1~24 期，所以期号超过 24 的必然是追加产生的。
 * - **已确认的核销调整单引用**时阻断：它已经把金额算进生效口径，必须先退回草稿。
 * - **草稿调整单引用**时不阻断，删除时顺手把该期从草稿里摘掉（草稿本来就没有生效），
 *   并重算这些草稿的明细条数与差额合计，避免留下悬空明细。
 * - 被服务费对账单引用时阻断：对账口径已经把这期金额算进去了，删掉会账实不符。
 * - 删除同时把该明细剩余各期的 `totalMonths` 重算成剩余最大期号，列表口径才一致。
 */
export async function deletePrepaymentWriteOffTail(id: string) {
  const writeOffId = String(id ?? "").trim();
  if (!writeOffId) throw new Error("请选择要删除的尾期");

  const [row] = await queryRows<Row>(
    `SELECT id, contractNo, contractLineId, writeOffMonth, monthIndex, monthlyAmount, sourceType
       FROM monthlyprepaymentwriteoffs WHERE id = :writeOffId LIMIT 1`,
    { writeOffId },
  );
  if (!row) throw new Error("该月核销明细不存在，可能已被删除");
  if (!isAppendedTailPeriod(row.monthIndex)) {
    throw new Error(`只有追加产生的尾期（第 ${WRITE_OFF_MONTHS + 1} 期及以后）可以删除；合同确认生成的前 ${WRITE_OFF_MONTHS} 期请用预付款核销调整单处理`);
  }

  const adjustments = await queryRows<Row>(
    `SELECT item.adjustmentNo, adjustment.status
       FROM prepaymentwriteoffadjustmentitems item
       LEFT JOIN prepaymentwriteoffadjustments adjustment ON adjustment.adjustmentNo = item.adjustmentNo
      WHERE item.monthlyWriteOffId = :writeOffId
      ORDER BY item.adjustmentNo`,
    { writeOffId },
  );
  const confirmedAdjustments = adjustments.filter((item) => String(item.status ?? "") === "已确认");
  if (confirmedAdjustments.length) {
    const detail = confirmedAdjustments.map((item) => String(item.adjustmentNo ?? "")).join("、");
    throw new Error(`该尾期已被已确认的预付款核销调整单 ${detail} 引用，请先把它退回草稿或删除后再删尾期`);
  }
  const draftAdjustments = Array.from(new Set(adjustments.map((item) => String(item.adjustmentNo ?? "")).filter(Boolean)));

  const [snapshot] = await queryRows<Row>(
    `SELECT COUNT(*) AS total
       FROM servicefeesnapshotitems
      WHERE FIND_IN_SET(:writeOffId, COALESCE(prepaymentSourceIds, '')) > 0`,
    { writeOffId },
  );
  if (Number(snapshot?.total ?? 0) > 0) {
    throw new Error("该尾期已被服务费对账单引用，请先处理对应服务费对账单");
  }

  const contractLineId = String(row.contractLineId ?? "");
  const [remaining] = await queryRows<Row>(
    `SELECT COALESCE(MAX(monthIndex), 0) AS lastIndex FROM monthlyprepaymentwriteoffs
      WHERE contractLineId = :contractLineId AND id <> :writeOffId`,
    { contractLineId, writeOffId },
  );
  const lastIndex = Number(remaining?.lastIndex ?? 0);

  await withTransaction(async (connection) => {
    await executeInTransaction(connection, "DELETE FROM monthlyprepaymentwriteoffs WHERE id = :writeOffId", { writeOffId });
    // 草稿调整单引用过这一期：草稿没有生效，直接摘掉明细并重算统计，避免留下悬空明细。
    if (draftAdjustments.length) {
      await executeInTransaction(
        connection,
        "DELETE FROM prepaymentwriteoffadjustmentitems WHERE monthlyWriteOffId = :writeOffId",
        { writeOffId },
      );
      for (const adjustmentNo of draftAdjustments) {
        await executeInTransaction(
          connection,
          `UPDATE prepaymentwriteoffadjustments target
              SET target.itemCount = (SELECT COUNT(*) FROM prepaymentwriteoffadjustmentitems item WHERE item.adjustmentNo = target.adjustmentNo),
                  target.differenceTotal = (SELECT COALESCE(SUM(item.differenceAmount), 0) FROM prepaymentwriteoffadjustmentitems item WHERE item.adjustmentNo = target.adjustmentNo)
            WHERE target.adjustmentNo = :adjustmentNo`,
          { adjustmentNo },
        );
      }
    }
    // 期数变了，同明细剩余各期的 totalMonths 一起回退，列表口径才一致。
    if (lastIndex > 0) {
      await executeInTransaction(
        connection,
        "UPDATE monthlyprepaymentwriteoffs SET totalMonths = :lastIndex WHERE contractLineId = :contractLineId",
        { lastIndex, contractLineId },
      );
    }
  });

  return {
    id: writeOffId,
    contractNo: String(row.contractNo ?? ""),
    contractLineId,
    writeOffMonth: formatDate(new Date(String(row.writeOffMonth ?? ""))),
    monthIndex: Number(row.monthIndex ?? 0),
    amount: roundMoney(Number(row.monthlyAmount ?? 0)),
    totalMonths: lastIndex,
    cleanedDraftAdjustments: draftAdjustments,
  };
}

export async function listAvailablePrepaymentWriteOffs(searchParams: URLSearchParams) {
  const { where, params } = buildMonthlyWhere(searchParams);
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("pageSize") ?? 20) || 20)));
  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM monthlyprepaymentwriteoffs ${where}`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
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
        quantity,
        sourceType,
        adjustmentNo
      FROM monthlyprepaymentwriteoffs
      ${where}
      ORDER BY writeOffMonth DESC, contractNo, contractLineId
      LIMIT :limit OFFSET :offset
    `,
    { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  );

  return { rows, total, page, pageSize, totalPages };
}

export async function listPrepaymentWriteOffAdjustments(searchParams: URLSearchParams) {
  const keyword = searchParams.get("keyword")?.trim();
  const status = searchParams.get("status")?.trim();
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get("pageSize") ?? 20) || 20)));
  const whereParts: string[] = [];
  const params: Row = {};
  const filterExpressions: Record<string, string> = {
    adjustmentNo: "adjustmentNo", status: "status", countryCode: "countryCode", batchName: "batchName", contractNo: "contractNo", itemCount: "itemCount", differenceTotal: "differenceTotal", reason: "reason",
  };
  for (const [field, expression] of Object.entries(filterExpressions)) appendTableInFilter(whereParts, params, expression, field, searchParams, "prepaymentAdjustment");

  if (keyword) {
    whereParts.push(
      "(adjustmentNo LIKE :keyword OR contractNo LIKE :keyword OR batchName LIKE :keyword OR reason LIKE :keyword)",
    );
    params.keyword = `%${keyword}%`;
  }
  if (status) {
    whereParts.push("status = :status");
    params.status = status;
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const [{ total: totalValue }] = await queryRows<{ total: number }>(`SELECT COUNT(*) AS total FROM prepaymentwriteoffadjustments ${where}`, params);
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rows = await queryRows<Row>(
    `
      SELECT
        adjustmentNo,
        status,
        countryCode,
        batchName,
        contractNo,
        itemCount,
        differenceTotal,
        reason,
        confirmedAt,
        createdAt,
        updatedAt
      FROM prepaymentwriteoffadjustments
      ${where}
      ${getTableSort(searchParams, filterExpressions) || "ORDER BY createdAt DESC"}
      LIMIT :limit OFFSET :offset
    `,
    { ...params, limit: pageSize, offset: (page - 1) * pageSize },
  );

  return { rows, total, page, pageSize, totalPages };
}

export async function listPrepaymentAdjustmentFilterOptions(searchParams: URLSearchParams) {
  const expressions: Record<string, string> = {
    adjustmentNo: "adjustmentNo", status: "status", countryCode: "countryCode", batchName: "batchName", contractNo: "contractNo", itemCount: "itemCount", differenceTotal: "differenceTotal", reason: "reason",
  };
  const field = searchParams.get("field")?.trim() ?? "";
  const expression = expressions[field];
  if (!expression) return { options: [] as Array<{ value: string; count: number }> };
  const params: Row = {};
  const where = [`${expression} IS NOT NULL`, `TRIM(CAST(${expression} AS CHAR)) <> ''`];
  const keyword = searchParams.get("keyword")?.trim() ?? "";
  if (keyword) { where.push(`${expression} LIKE :optionKeyword`); params.optionKeyword = `%${keyword}%`; }
  appendTableFilterOptionConditions(where, params, expressions, searchParams, field);
  const rows = await queryRows<{ value: string; count: number }>(`SELECT ${expression} AS value, COUNT(*) AS count FROM prepaymentwriteoffadjustments WHERE ${where.join(" AND ")} GROUP BY ${expression} ORDER BY ${getTableFilterOptionsOrderBy(field, expression)} LIMIT 500`, params);
  return { options: rows.map((row) => ({ value: String(row.value ?? ""), count: Number(row.count ?? 0) })) };
}

export async function getPrepaymentWriteOffAdjustment(adjustmentNo: string) {
  const rows = await queryRows<Row>(
    `
      SELECT
        adjustmentNo,
        status,
        countryCode,
        batchName,
        contractNo,
        itemCount,
        differenceTotal,
        reason,
        confirmedAt,
        createdAt,
        updatedAt
      FROM prepaymentwriteoffadjustments
      WHERE adjustmentNo = :adjustmentNo
      LIMIT 1
    `,
    { adjustmentNo },
  );
  const adjustment = rows[0] ?? null;
  const items = adjustment
    ? await queryRows<Row>(
        `
          SELECT
            id,
            adjustmentNo,
            monthlyWriteOffId,
            contractNo,
            contractLineId,
            DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
            countryCode,
            batchName,
            requestNo,
            poNo,
            deviceCode,
            modelCode,
            nameEn,
            quantity,
            currency,
            originalMonthlyAmount,
            adjustedMonthlyAmount,
            differenceAmount,
            DATE_FORMAT(createdAt, '%Y-%m-%d') AS createdAt,
            DATE_FORMAT(updatedAt, '%Y-%m-%d') AS updatedAt
          FROM prepaymentwriteoffadjustmentitems
          WHERE adjustmentNo = :adjustmentNo
          ORDER BY writeOffMonth, id
        `,
        { adjustmentNo },
      )
    : [];

  return { adjustment, items };
}

export async function savePrepaymentWriteOffAdjustment(payload: PrepaymentAdjustmentPayload) {
  const adjustmentNo = payload.adjustmentNo.trim();
  if (!adjustmentNo) throw new Error("调整单号不能为空");
  if (!payload.monthlyWriteOffIds.length) throw new Error("请选择需要调整的预付款月核销明细");

  const existing = await getPrepaymentWriteOffAdjustment(adjustmentNo);
  if (existing.adjustment && String(existing.adjustment.status) === "已确认") {
    throw new Error("已确认的调整单不可修改");
  }

  const monthlyRows = await getMonthlyWriteOffRowsByIds(payload.monthlyWriteOffIds);
  if (monthlyRows.length !== payload.monthlyWriteOffIds.length) {
    throw new Error("部分预付款月核销明细不存在，请刷新后重试");
  }

  const items = buildPrepaymentWriteOffAdjustmentItems({
    adjustmentNo,
    rows: monthlyRows,
    adjustedAmounts: payload.adjustedAmounts,
  });
  const first = monthlyRows[0];
  const differenceTotal = roundMoney(items.reduce((total, item) => total + item.differenceAmount, 0));

  await execute(
    `
      INSERT INTO prepaymentwriteoffadjustments
        (adjustmentNo, status, countryCode, batchName, contractNo, itemCount, differenceTotal, reason)
      VALUES
        (:adjustmentNo, '草稿', :countryCode, :batchName, :contractNo, :itemCount, :differenceTotal, :reason)
      ON DUPLICATE KEY UPDATE
        status = '草稿',
        countryCode = VALUES(countryCode),
        batchName = VALUES(batchName),
        contractNo = VALUES(contractNo),
        itemCount = VALUES(itemCount),
        differenceTotal = VALUES(differenceTotal),
        reason = VALUES(reason)
    `,
    {
      adjustmentNo,
      countryCode: first.countryCode ?? "",
      batchName: first.batchName ?? "",
      contractNo: first.contractNo ?? "",
      itemCount: items.length,
      differenceTotal,
      reason: payload.reason ?? "",
    },
  );
  // 明细整体替换放进事务：中途失败不再留下"删了一半、插了一半"的数据。
  await withTransaction(async (connection) => {
    await executeInTransaction(connection, "DELETE FROM prepaymentwriteoffadjustmentitems WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
    for (const item of items) {
      await insertAdjustmentItem(item, connection);
    }
  });

  return getPrepaymentWriteOffAdjustment(adjustmentNo);
}

export async function deletePrepaymentWriteOffAdjustment(adjustmentNo: string) {
  const { adjustment } = await getPrepaymentWriteOffAdjustment(adjustmentNo);
  if (!adjustment) return;
  if (String(adjustment.status) === "已确认") throw new Error("已确认的调整单不可删除");

  await execute("DELETE FROM prepaymentwriteoffadjustmentitems WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
  await execute("DELETE FROM prepaymentwriteoffadjustments WHERE adjustmentNo = :adjustmentNo", { adjustmentNo });
}

export async function confirmPrepaymentWriteOffAdjustment(adjustmentNo: string) {
  const { adjustment, items } = await getPrepaymentWriteOffAdjustment(adjustmentNo);
  if (!adjustment) throw new Error("调整单不存在");
  if (String(adjustment.status) === "已确认") return { adjustment, items };
  if (!items.length) throw new Error("调整单明细不能为空");

  /**
   * 确认时只做**提醒**，不做拦截。
   *
   * 实际业务里"某个月先调多、某个月再调少"很常见，而且哪个客户约定还没谈好，
   * 强制配平会把用户卡死；对账时看的也是**整个合同**，同一合同内明细之间互相
   * 对冲（A 明细少 1000、B 明细多 1000）本来就应该是平的。
   *
   * 所以这里按**合同**聚合判断，把差额作为 warnings 返回给前端做黄色提示，
   * 调整单照常确认。真正的"未平"由预付款合同的核销状态提醒兜底。
   * 注意：只统计**已生效**金额 + 本次调整，草稿调整单不算数（草稿可能不确认）。
   */
  const adjustedById = new Map(items.map((item) => [String(item.monthlyWriteOffId), Number(item.adjustedMonthlyAmount ?? 0)]));
  const warnings: string[] = [];
  const contractNos = [...new Set(items.map((item) => String(item.contractNo ?? "")).filter(Boolean))];
  for (const contractNo of contractNos) {
    const rows = await queryRows<Row>(
      "SELECT id, monthlyAmount, contractLineId, originalAmount FROM monthlyprepaymentwriteoffs WHERE contractNo = :contractNo",
      { contractNo },
    );
    if (!rows.length) continue;
    const total = roundMoney(rows.reduce(
      (sum, row) => sum + (adjustedById.has(String(row.id)) ? adjustedById.get(String(row.id))! : Number(row.monthlyAmount ?? 0)),
      0,
    ));
    // 合同金额 = 各明细的 originalAmount 之和（每条明细的月核销行都带着自己的明细金额，
    // 按 contractLineId 去重后再求和，避免按行重复累加）
    const originalByLine = new Map<string, number>();
    for (const row of rows) {
      const lineId = String(row.contractLineId ?? "");
      if (!originalByLine.has(lineId)) originalByLine.set(lineId, Number(row.originalAmount ?? 0));
    }
    const contractTarget = roundMoney([...originalByLine.values()].reduce((sum, value) => sum + value, 0));
    const gap = roundMoney(contractTarget - total);
    if (gap !== 0) {
      warnings.push(
        gap > 0
          ? `预付款合同 ${contractNo} 当前核销合计 ${total}，比合同金额 ${contractTarget} 少 ${gap}`
          : `预付款合同 ${contractNo} 当前核销合计 ${total}，比合同金额 ${contractTarget} 多 ${Math.abs(gap)}`,
      );
    }
  }

  for (const item of items) {
    await execute(
      `
        UPDATE monthlyprepaymentwriteoffs
        SET monthlyAmount = :monthlyAmount,
            sourceType = '调整单',
            adjustmentNo = :adjustmentNo
        WHERE id = :monthlyWriteOffId
      `,
      {
        monthlyAmount: Number(item.adjustedMonthlyAmount ?? 0),
        adjustmentNo,
        monthlyWriteOffId: item.monthlyWriteOffId,
      },
    );
  }

  await execute(
    `
      UPDATE prepaymentwriteoffadjustments
      SET status = '已确认',
          confirmedAt = CURRENT_TIMESTAMP
      WHERE adjustmentNo = :adjustmentNo
    `,
    { adjustmentNo },
  );

  // 返回 warnings 供前端做黄色提醒；调整单本身照常确认（不拦截）。
  const result = await getPrepaymentWriteOffAdjustment(adjustmentNo);
  return { ...result, warnings };
}

/**
 * 退回草稿：撤销确认，把该调整单改过的月核销金额还原成调整前的值，
 * 并清掉来源标记，效果等同这张调整单从未确认。调整单本身保留为草稿可继续修改。
 */
export async function rollbackPrepaymentWriteOffAdjustment(adjustmentNo: string) {
  const { adjustment, items } = await getPrepaymentWriteOffAdjustment(adjustmentNo);
  if (!adjustment) throw new Error("调整单不存在");
  if (String(adjustment.status) !== "已确认") throw new Error("只有已确认的调整单可以退回草稿");

  await withTransaction(async (connection) => {
    for (const item of items) {
      await executeInTransaction(
        connection,
        `
          UPDATE monthlyprepaymentwriteoffs
          SET monthlyAmount = :monthlyAmount,
              sourceType = '首次生成',
              adjustmentNo = NULL
          WHERE id = :id
            AND adjustmentNo = :adjustmentNo
        `,
        {
          id: String(item.monthlyWriteOffId ?? ""),
          adjustmentNo,
          monthlyAmount: Number(item.originalMonthlyAmount ?? 0),
        },
      );
    }
    await executeInTransaction(
      connection,
      `
        UPDATE prepaymentwriteoffadjustments
        SET status = '草稿',
            confirmedAt = NULL
        WHERE adjustmentNo = :adjustmentNo
      `,
      { adjustmentNo },
    );
  });

  return getPrepaymentWriteOffAdjustment(adjustmentNo);
}

function buildMonthlyWhere(searchParams: URLSearchParams) {
  const keyword = searchParams.get("keyword")?.trim();
  const startMonth = searchParams.get("startMonth")?.trim();
  const endMonth = searchParams.get("endMonth")?.trim();
  const countryCode = searchParams.get("countryCode")?.trim();
  const batchName = searchParams.get("batchName")?.trim();
  const contractNo = searchParams.get("contractNo")?.trim();
  const deviceCode = searchParams.get("deviceCode")?.trim();
  const whereParts: string[] = [];
  const params: Row = {};

  if (keyword) {
    whereParts.push(
      "(contractNo LIKE :keyword OR countryCode LIKE :keyword OR batchName LIKE :keyword OR requestNo LIKE :keyword OR poNo LIKE :keyword OR deviceCode LIKE :keyword OR nameEn LIKE :keyword)",
    );
    params.keyword = `%${keyword}%`;
  }
  if (startMonth) {
    whereParts.push("writeOffMonth >= :startMonth");
    params.startMonth = firstDayOfMonth(startMonth);
  }
  if (endMonth) {
    whereParts.push("writeOffMonth <= :endMonth");
    params.endMonth = firstDayOfMonth(endMonth);
  }
  if (countryCode) {
    whereParts.push("countryCode = :countryCode");
    params.countryCode = countryCode;
  }
  if (batchName) {
    whereParts.push("batchName = :batchName");
    params.batchName = batchName;
  }
  if (contractNo) {
    whereParts.push("contractNo = :contractNo");
    params.contractNo = contractNo;
  }
  if (deviceCode) {
    whereParts.push("deviceCode = :deviceCode");
    params.deviceCode = deviceCode;
  }

  return {
    where: whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "",
    params,
  };
}

async function getMonthlyWriteOffRowsByIds(ids: string[]) {
  const params = Object.fromEntries(ids.map((id, index) => [`id${index}`, id]));
  const placeholders = ids.map((_, index) => `:id${index}`).join(", ");

  return queryRows<PrepaymentMonthlyWriteOffForAdjustment>(
    `
      SELECT
        id,
        contractNo,
        contractLineId,
        DATE_FORMAT(writeOffMonth, '%Y-%m-%d') AS writeOffMonth,
        currency,
        monthlyAmount,
        lineType,
        countryCode,
        batchName,
        requestNo,
        poNo,
        deviceCode,
        modelCode,
        nameEn,
        quantity
      FROM monthlyprepaymentwriteoffs
      WHERE id IN (${placeholders})
    `,
    params,
  );
}

async function insertAdjustmentItem(
  item: PrepaymentWriteOffAdjustmentItemDraft,
  connection: PoolConnection | null = null,
) {
  const sql = `
      INSERT INTO prepaymentwriteoffadjustmentitems
        (id, adjustmentNo, monthlyWriteOffId, contractNo, contractLineId, writeOffMonth,
         countryCode, batchName, requestNo, poNo, deviceCode, modelCode, nameEn, quantity,
         currency, originalMonthlyAmount, adjustedMonthlyAmount, differenceAmount)
      VALUES
        (:id, :adjustmentNo, :monthlyWriteOffId, :contractNo, :contractLineId, :writeOffMonth,
         :countryCode, :batchName, :requestNo, :poNo, :deviceCode, :modelCode, :nameEn, :quantity,
         :currency, :originalMonthlyAmount, :adjustedMonthlyAmount, :differenceAmount)
    `;
  if (connection) await executeInTransaction(connection, sql, item);
  else await execute(sql, item);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
