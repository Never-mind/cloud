/**
 * 远程库派生数据回填（幂等，默认 dry-run）。
 *
 * 覆盖 scripts/migrate.ts 里那批“新增列 + 回填”逻辑中，可以纯靠数据推导的部分：
 *   1. purchaseorderitems.currency / taxExcludedUnitPrice / taxSurcharge
 *   2. purchaseorderitems 的算力服务费快照（powerPricingJson / powerFirst24VatIncluded / powerNext36VatIncluded）
 *   3. 各财务明细表的 customerId（按 requestitems 反查）
 *   4. 各财务明细表的 requestType（按请求/账单反查，兜底「整机」）
 *
 * 说明：本地与远程的业务编号（poNo/requestNo/deviceCode）是同一批，但行级 UUID 各库独立生成，
 * 所以只能按规则重算，不能按主键复制。
 *
 * 用法：
 *   tsx scripts/backfill-remote-derived-data.mjs              # 预演（事务内执行后回滚，输出精确影响行数）
 *   tsx scripts/backfill-remote-derived-data.mjs --validate   # 用本地数据自检测算管线是否与历史值一致
 *   tsx scripts/backfill-remote-derived-data.mjs --apply      # 真正写入远程
 */
import mysql from "mysql2/promise";
import { buildDbConfig } from "../src/lib/db.ts";
import { buildPowerPricingSnapshot, serializePowerPricingSnapshot } from "../src/lib/power-price-calculator.ts";

const apply = process.argv.includes("--apply");
const validate = process.argv.includes("--validate");

const local = await mysql.createConnection(buildDbConfig(process.env));
const remote = validate ? local : await mysql.createConnection({
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT ?? 3306),
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  database: process.env.TARGET_DB_NAME,
  charset: "utf8mb4",
  namedPlaceholders: true,
});

const POWER_CONTEXT_SQL = `
  SELECT
    item.id,
    UPPER(TRIM(SUBSTRING_INDEX(requestMaster.countryCode, '-', 1))) AS countryCode,
    requestItem.deviceCode,
    instanceModel.b6Type,
    COALESCE(NULLIF(item.currency, ''), purchase.currency, 'USD') AS purchaseCurrency,
    COALESCE(item.taxExcludedUnitPrice, item.unitPrice, 0) AS taxExcludedUnitPrice,
    COALESCE(item.taxSurcharge, 0) AS taxSurcharge,
    purchase.usdRate AS exchangeRate
  FROM merge_power_purchaseorderitems item
  LEFT JOIN merge_power_purchaseorders purchase
    ON purchase.purchaseOrderId = item.purchaseOrderId
    OR ((item.purchaseOrderId IS NULL OR item.purchaseOrderId = '') AND purchase.poNo = item.poNo)
  LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = item.requestItemId
  LEFT JOIN merge_power_requests requestMaster
    ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo, purchase.requestNo)
  LEFT JOIN merge_power_instancemodels instanceModel ON instanceModel.deviceCode = requestItem.deviceCode
  WHERE (item.powerPricingJson IS NULL OR TRIM(item.powerPricingJson) = '')
    AND item.powerFirst24VatIncluded IS NULL
    AND item.powerNext36VatIncluded IS NULL
    AND COALESCE(item.powerFirst24Manual, 0) = 0
    AND COALESCE(item.powerNext36Manual, 0) = 0
`;

const sqlSteps = [
  {
    name: "purchaseorderitems.currency",
    sql: `UPDATE merge_power_purchaseorderitems item
          LEFT JOIN merge_power_purchaseorders purchaseOrder
            ON purchaseOrder.purchaseOrderId = item.purchaseOrderId OR purchaseOrder.poNo = item.poNo
          SET item.currency = CASE
            WHEN UPPER(TRIM(COALESCE(NULLIF(item.currency, ''), purchaseOrder.currency, ''))) IN ('CNY', 'USD')
              THEN UPPER(TRIM(COALESCE(NULLIF(item.currency, ''), purchaseOrder.currency, '')))
            ELSE 'USD'
          END
          WHERE item.currency IS NULL
            OR TRIM(item.currency) = ''
            OR UPPER(TRIM(item.currency)) NOT IN ('CNY', 'USD')`,
  },
  {
    name: "purchaseorderitems.taxExcludedUnitPrice / taxSurcharge",
    sql: `UPDATE merge_power_purchaseorderitems
          SET taxExcludedUnitPrice = COALESCE(taxExcludedUnitPrice, unitPrice),
              taxSurcharge = COALESCE(taxSurcharge, 0)
          WHERE taxExcludedUnitPrice IS NULL OR taxSurcharge IS NULL`,
  },
  {
    name: "billinginstanceledgers.customerId",
    sql: `UPDATE merge_power_billinginstanceledgers ledger
          LEFT JOIN merge_power_purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
          LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = purchaseItem.requestItemId
          LEFT JOIN merge_power_requestitems fallback
            ON fallback.requestNo = ledger.requestNo AND fallback.deviceCode = ledger.deviceCode
          SET ledger.customerId = COALESCE(NULLIF(ledger.customerId, ''), requestItem.customerId, fallback.customerId)
          WHERE NULLIF(ledger.customerId, '') IS NULL`,
  },
  {
    name: "monthlybillingwriteoffs.customerId",
    sql: `UPDATE merge_power_monthlybillingwriteoffs monthly
          LEFT JOIN merge_power_billinginstanceledgers ledger ON ledger.ledgerId = monthly.ledgerId
          LEFT JOIN merge_power_requestitems fallback
            ON fallback.requestNo = monthly.requestNo AND fallback.deviceCode = monthly.deviceCode
          SET monthly.customerId = COALESCE(NULLIF(monthly.customerId, ''), ledger.customerId, fallback.customerId)
          WHERE NULLIF(monthly.customerId, '') IS NULL`,
  },
  {
    name: "prepaymentcontractitems.customerId",
    sql: `UPDATE merge_power_prepaymentcontractitems contractItem
          LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = contractItem.requestItemId
          LEFT JOIN merge_power_requestitems fallback
            ON fallback.requestNo = contractItem.requestNo AND fallback.deviceCode = contractItem.deviceCode
          SET contractItem.customerId = COALESCE(NULLIF(contractItem.customerId, ''), requestItem.customerId, fallback.customerId)
          WHERE NULLIF(contractItem.customerId, '') IS NULL`,
  },
  {
    name: "monthlyprepaymentwriteoffs.customerId",
    sql: `UPDATE merge_power_monthlyprepaymentwriteoffs monthly
          LEFT JOIN merge_power_prepaymentcontractitems contractItem ON contractItem.id = monthly.contractLineId
          LEFT JOIN merge_power_requestitems fallback
            ON fallback.requestNo = monthly.requestNo AND fallback.deviceCode = monthly.deviceCode
          SET monthly.customerId = COALESCE(NULLIF(monthly.customerId, ''), contractItem.customerId, fallback.customerId)
          WHERE NULLIF(monthly.customerId, '') IS NULL`,
  },
  {
    name: "servicefeesnapshotitems.customerId",
    sql: `UPDATE merge_power_servicefeesnapshotitems item
          LEFT JOIN merge_power_requestitems requestItem
            ON requestItem.requestNo = item.requestNo AND requestItem.deviceCode = item.deviceCode
          SET item.customerId = COALESCE(NULLIF(item.customerId, ''), requestItem.customerId)
          WHERE NULLIF(item.customerId, '') IS NULL`,
  },
  ...["merge_power_internalserviceledgers", "merge_power_monthlyinternalservicefees", "merge_power_internalservicefeeadjustments", "merge_power_internalservicefeesnapshotitems", "merge_power_balancesettlementitems"].map((table) => ({
    name: `${table}.customerId`,
    sql: `UPDATE \`${table}\` item
          LEFT JOIN merge_power_requestitems requestItem
            ON requestItem.requestNo = item.requestNo AND requestItem.deviceCode = item.deviceCode
          SET item.customerId = COALESCE(NULLIF(item.customerId, ''), requestItem.customerId)
          WHERE NULLIF(item.customerId, '') IS NULL`,
  })),
  {
    name: "requestitems.requestType",
    sql: `UPDATE merge_power_requestitems item
          LEFT JOIN merge_power_requests requestMaster ON requestMaster.requestNo = item.requestNo
          SET item.requestType = COALESCE(NULLIF(item.requestType, ''), NULLIF(requestMaster.requestType, ''), '整机')
          WHERE item.requestType IS NULL OR item.requestType = ''`,
  },
  {
    name: "purchaseorderitems.requestType",
    sql: `UPDATE merge_power_purchaseorderitems item
          LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = item.requestItemId
          LEFT JOIN merge_power_requests requestMaster ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo)
          SET item.requestType = COALESCE(NULLIF(item.requestType, ''), requestItem.requestType, requestMaster.requestType, '整机')
          WHERE item.requestType IS NULL OR item.requestType = ''`,
  },
  {
    name: "billinginstanceledgers.requestType",
    sql: `UPDATE merge_power_billinginstanceledgers ledger
          LEFT JOIN merge_power_purchaseorderitems purchaseItem ON purchaseItem.id = ledger.purchaseOrderItemId
          LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = purchaseItem.requestItemId
          SET ledger.requestType = COALESCE(NULLIF(ledger.requestType, ''), purchaseItem.requestType, requestItem.requestType, '整机')
          WHERE ledger.requestType IS NULL OR ledger.requestType = ''`,
  },
  {
    name: "monthlybillingwriteoffs.requestType",
    sql: `UPDATE merge_power_monthlybillingwriteoffs monthly
          LEFT JOIN merge_power_billinginstanceledgers ledger ON ledger.ledgerId = monthly.ledgerId
          SET monthly.requestType = COALESCE(NULLIF(monthly.requestType, ''), ledger.requestType, '整机')
          WHERE monthly.requestType IS NULL OR monthly.requestType = ''`,
  },
  {
    name: "prepaymentcontractitems.requestType",
    sql: `UPDATE merge_power_prepaymentcontractitems item
          LEFT JOIN merge_power_requestitems requestItem ON requestItem.id = item.requestItemId
          SET item.requestType = COALESCE(NULLIF(item.requestType, ''), requestItem.requestType, CASE WHEN item.lineType = 'fee' THEN NULL ELSE '整机' END)
          WHERE item.requestType IS NULL OR item.requestType = ''`,
  },
  {
    name: "monthlyprepaymentwriteoffs.requestType",
    sql: `UPDATE merge_power_monthlyprepaymentwriteoffs monthly
          LEFT JOIN merge_power_prepaymentcontractitems contractItem ON contractItem.id = monthly.contractLineId
          SET monthly.requestType = COALESCE(NULLIF(monthly.requestType, ''), contractItem.requestType)
          WHERE monthly.requestType IS NULL OR monthly.requestType = ''`,
  },
  {
    name: "servicefeesnapshotitems.requestType",
    sql: `UPDATE merge_power_servicefeesnapshotitems item
          LEFT JOIN merge_power_monthlybillingwriteoffs billing ON FIND_IN_SET(billing.id, COALESCE(item.billingSourceIds, '')) > 0
          LEFT JOIN merge_power_monthlyprepaymentwriteoffs prepayment ON FIND_IN_SET(prepayment.id, COALESCE(item.prepaymentSourceIds, '')) > 0
          SET item.requestType = COALESCE(NULLIF(item.requestType, ''), billing.requestType, prepayment.requestType)
          WHERE item.requestType IS NULL OR item.requestType = ''`,
  },
];

async function runSqlSteps(conn) {
  const results = [];
  await conn.query("START TRANSACTION");
  try {
    for (const step of sqlSteps) {
      const [result] = await conn.query(step.sql);
      results.push({ name: step.name, affected: Number(result.affectedRows ?? 0) });
    }
    if (apply && !validate) {
      await conn.query("COMMIT");
    } else {
      await conn.query("ROLLBACK");
    }
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
  return results;
}

async function runPowerPricing(conn) {
  const [rows] = await conn.query(POWER_CONTEXT_SQL);
  let updated = 0;
  let skipped = 0;
  await conn.query("START TRANSACTION");
  try {
    for (const row of rows) {
      const id = String(row.id ?? "").trim();
      const countryCode = String(row.countryCode ?? "").trim();
      const deviceCode = String(row.deviceCode ?? "").trim();
      if (!id || !countryCode || !deviceCode) {
        skipped += 1;
        continue;
      }
      const snapshot = buildPowerPricingSnapshot({
        countryCode,
        deviceCode,
        b6Type: String(row.b6Type ?? ""),
        purchaseCurrency: String(row.purchaseCurrency ?? "USD"),
        taxExcludedUnitPrice: Number(row.taxExcludedUnitPrice ?? 0),
        taxSurcharge: Number(row.taxSurcharge ?? 0),
        exchangeRate: Number(row.exchangeRate ?? 0),
      });
      if (validate) {
        updated += 1;
        continue;
      }
      await conn.execute(
        `UPDATE merge_power_purchaseorderitems
            SET powerPricingJson = :powerPricingJson,
                powerFirst24VatIncluded = :powerFirst24VatIncluded,
                powerNext36VatIncluded = :powerNext36VatIncluded
          WHERE id = :id
            AND (powerPricingJson IS NULL OR TRIM(powerPricingJson) = '')
            AND powerFirst24VatIncluded IS NULL
            AND powerNext36VatIncluded IS NULL
            AND COALESCE(powerFirst24Manual, 0) = 0
            AND COALESCE(powerNext36Manual, 0) = 0`,
        {
          id,
          powerPricingJson: serializePowerPricingSnapshot(snapshot),
          powerFirst24VatIncluded: snapshot.result.first24VatIncluded,
          powerNext36VatIncluded: snapshot.result.next36VatIncluded,
        },
      );
      updated += 1;
    }
    if (apply && !validate) {
      await conn.query("COMMIT");
    } else {
      await conn.query("ROLLBACK");
    }
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
  return { candidates: rows.length, updated, skipped };
}

/**
 * merge_cloud_supplier_payments 的应付字段是按 merge_cloud_rows 实时聚合出来的
 * （见 src/lib/cloud-service.ts 的 CLOUD_SUPPLIER_PAYMENT_GROUPS），
 * 这里把同样的口径落库，供外部系统直接取值。
 */
async function runSupplierPayable(conn) {
  const period = (expression) => `REPLACE(REPLACE(TRIM(COALESCE(${expression}, '')), '-', ''), '/', '')`;
  const [rows] = await conn.query(`
    SELECT p.id,
           COALESCE(SUM(COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0)), 0) AS net,
           MAX(COALESCE(r.supplierTaxRate, 0.16)) AS rate,
           COALESCE(SUM(COALESCE(r.supplierTaxAmount,
             COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16))), 0) AS tax,
           COALESCE(SUM(COALESCE(r.supplierPayableTotalAmount,
             COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0)
             + COALESCE(r.supplierTaxAmount,
                 COALESCE(r.supplierPayableNetAmount, r.supplierPayable, 0) * COALESCE(r.supplierTaxRate, 0.16)))), 0) AS total
      FROM merge_cloud_supplier_payments p
      LEFT JOIN merge_cloud_rows r
        ON ${period("r.period")} = ${period("p.period")}
       AND ((NULLIF(r.supplierId, '') IS NOT NULL AND p.supplierId = r.supplierId)
         OR (NULLIF(r.supplierId, '') IS NULL AND (p.supplierId IS NULL OR p.supplierId = '') AND p.supplierName = r.supplierName))
     WHERE NULLIF(p.supplierPayableNetAmount, '') IS NULL
     GROUP BY p.id
  `);
  let updated = 0;
  await conn.query("START TRANSACTION");
  try {
    for (const row of rows) {
      if (!apply || validate) {
        updated += 1;
        continue;
      }
      await conn.execute(
        `UPDATE merge_cloud_supplier_payments
            SET supplierPayableCurrency = 'USD',
                supplierPayableNetAmount = :net,
                supplierTaxRate = :rate,
                supplierTaxAmount = :tax,
                supplierPayableTotalAmount = :total
          WHERE id = :id AND NULLIF(supplierPayableNetAmount, '') IS NULL`,
        { id: row.id, net: row.net, rate: row.rate, tax: row.tax, total: row.total },
      );
      updated += 1;
    }
    if (apply && !validate) await conn.query("COMMIT");
    else await conn.query("ROLLBACK");
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  }
  return { candidates: rows.length, updated };
}

if (validate) {
  // 自检：用当前管线重算本地数据，与本地库里已存在的历史值比对，确认公式与取值口径一致。
  const [stored] = await local.query(
    "SELECT id, powerFirst24VatIncluded, powerNext36VatIncluded FROM merge_power_purchaseorderitems WHERE powerFirst24VatIncluded IS NOT NULL",
  );
  const storedById = new Map(stored.map((row) => [String(row.id), row]));
  const [contexts] = await local.query(
    POWER_CONTEXT_SQL.replace(/WHERE[\s\S]*$/, "WHERE item.powerFirst24VatIncluded IS NOT NULL AND COALESCE(item.powerFirst24Manual, 0) = 0 AND COALESCE(item.powerNext36Manual, 0) = 0"),
  );
  let same = 0;
  const diffs = [];
  for (const row of contexts) {
    const expected = storedById.get(String(row.id));
    if (!expected) continue;
    const snapshot = buildPowerPricingSnapshot({
      countryCode: String(row.countryCode ?? "").trim(),
      deviceCode: String(row.deviceCode ?? "").trim(),
      b6Type: String(row.b6Type ?? ""),
      purchaseCurrency: String(row.purchaseCurrency ?? "USD"),
      taxExcludedUnitPrice: Number(row.taxExcludedUnitPrice ?? 0),
      taxSurcharge: Number(row.taxSurcharge ?? 0),
      exchangeRate: Number(row.exchangeRate ?? 0),
    });
    const same24 = Number(expected.powerFirst24VatIncluded) === Number(snapshot.result.first24VatIncluded);
    const same36 = Number(expected.powerNext36VatIncluded) === Number(snapshot.result.next36VatIncluded);
    if (same24 && same36) same += 1;
    else if (diffs.length < 10) diffs.push(`${row.id} 库内 ${expected.powerFirst24VatIncluded}/${expected.powerNext36VatIncluded} vs 重算 ${snapshot.result.first24VatIncluded}/${snapshot.result.next36VatIncluded}`);
  }
  console.log(`本地自检：可比对 ${contexts.length} 行，重算与历史值一致 ${same} 行`);
  for (const item of diffs) console.log(`  不一致：${item}`);
} else {
  const sqlResults = await runSqlSteps(remote);
  for (const item of sqlResults) console.log(`${item.name.padEnd(48)} 影响 ${item.affected} 行`);
  const power = await runPowerPricing(remote);
  console.log(`${"purchaseorderitems 算力服务费快照".padEnd(48)} 候选 ${power.candidates} 行，可写入 ${power.updated} 行，缺国家/设备跳过 ${power.skipped} 行`);
  const supplierPayable = await runSupplierPayable(remote);
  console.log(`${"cloud_supplier_payments 应付字段".padEnd(48)} 候选 ${supplierPayable.candidates} 行，可写入 ${supplierPayable.updated} 行`);
  console.log(apply ? "\n已提交写入。" : "\n以上为预演结果（事务已回滚，未写入）。追加 --apply 才会生效。");
}

await local.end();
if (remote !== local) await remote.end();
