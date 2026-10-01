import mysql from "mysql2/promise";

/**
 * 业务数据质量体检（只读）：跑一遍常见的"数据不全 / 口径对不上"检查，
 * 用于定期自查或上线后核对。用法：npm run audit:data
 */
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? "127.0.0.1",
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "root",
  database: process.env.DB_NAME ?? "merge",
  charset: "utf8mb4",
});
const q = async (sql, params) => (await conn.query(sql, params))[0];

console.log("== 物流时间节点完整度（按远端来源分类）");
const shipments = await q(`
  SELECT COALESCE(remoteLogisticsSourceStatus, '(空)') AS remoteStatus, COUNT(*) AS total,
         SUM(COALESCE(crd, '') = '') AS missingCrd,
         SUM(COALESCE(supplierEtaAt, '') = '') AS missingEta,
         SUM(COALESCE(apdAt, '') = '') AS missingApd,
         SUM(COALESCE(departedAt, '') = '') AS missingDeparted,
         SUM(COALESCE(arrivedAt, '') = '') AS missingArrived,
         SUM(COALESCE(customsClearedAt, '') = '') AS missingCustoms,
         SUM(COALESCE(deliveredAt, '') = '') AS missingDelivered
    FROM merge_power_shipments GROUP BY remoteLogisticsSourceStatus ORDER BY total DESC`);
console.table(shipments);
console.log("  说明：legacy=迁移前的历史单、pending=还没匹配上远端，缺时间是正常的；");
console.log("        只有 remote 里缺 CRD/ReleaseID 的才需要在远端可达时「批量刷新物流」补抓。\n");

console.log("== 预付款合同核销差额（|已核销 − 合同明细合计| > 3 元）");
const prepayment = await q(`
  SELECT COUNT(*) AS confirmedContracts,
         SUM(ABS(COALESCE(written.total, 0) - COALESCE(target.total, 0)) > 3) AS unbalanced
    FROM merge_power_prepaymentcontracts pc
    LEFT JOIN (SELECT contractNo, SUM(monthlyAmount) AS total FROM merge_power_monthlyprepaymentwriteoffs GROUP BY contractNo) written ON written.contractNo = pc.contractNo
    LEFT JOIN (SELECT contractNo, SUM(contractTotalAmount) AS total FROM merge_power_prepaymentcontractitems GROUP BY contractNo) target ON target.contractNo = pc.contractNo
   WHERE pc.status = '已确认'`);
console.table(prepayment);
const unbalanced = await q(`
  SELECT pc.contractNo, ROUND(COALESCE(target.total, 0), 2) AS contractTotal,
         ROUND(COALESCE(written.total, 0), 2) AS writtenTotal,
         ROUND(COALESCE(written.total, 0) - COALESCE(target.total, 0), 2) AS gap
    FROM merge_power_prepaymentcontracts pc
    LEFT JOIN (SELECT contractNo, SUM(monthlyAmount) AS total FROM merge_power_monthlyprepaymentwriteoffs GROUP BY contractNo) written ON written.contractNo = pc.contractNo
    LEFT JOIN (SELECT contractNo, SUM(contractTotalAmount) AS total FROM merge_power_prepaymentcontractitems GROUP BY contractNo) target ON target.contractNo = pc.contractNo
   WHERE pc.status = '已确认' AND ABS(COALESCE(written.total, 0) - COALESCE(target.total, 0)) > 3 LIMIT 10`);
console.table(unbalanced);

console.log("== 账号飞书绑定（未绑定的收不到消息通知）");
const users = await q(`SELECT COUNT(*) AS accounts,
    SUM(COALESCE(feishuOpenId, '') = '') AS noFeishu, SUM(status <> 'active') AS disabled FROM merge_common_users`);
console.table(users);

console.log("== 档案信息完整度");
const parties = await q(`
  SELECT '客户' AS type, COUNT(*) AS total, SUM(COALESCE(country,'') = '') AS noCountry, SUM(COALESCE(city,'') = '') AS noCity, SUM(COALESCE(taxNumber,'') = '') AS noTaxNumber FROM merge_common_customers
  UNION ALL SELECT 'supplier', COUNT(*), SUM(COALESCE(country,'') = ''), SUM(COALESCE(city,'') = ''), SUM(COALESCE(taxNumber,'') = '') FROM merge_common_suppliers
  UNION ALL SELECT 'undertaking-unit', COUNT(*), SUM(COALESCE(country,'') = ''), SUM(COALESCE(city,'') = ''), SUM(COALESCE(taxNumber,'') = '') FROM merge_common_undertaking_units`);
console.table(parties);

console.log("== 华为云对账行");
const cloud = await q(`SELECT COUNT(*) AS rowsCount,
    SUM(COALESCE(customerReceivableTotalAmount, customerReceivableNetAmount, customerReceivable, 0) = 0) AS zeroReceivable,
    SUM(COALESCE(supplierPayableTotalAmount, supplierPayableNetAmount, supplierPayable, 0) = 0) AS zeroPayable,
    SUM(COALESCE(invoiceNo, '') = '') AS notInvoiced
  FROM merge_cloud_rows`);
console.table(cloud);

console.log("== CRM 发票 / 回款同步情况");
const crm = await q(`SELECT 'invoice' AS kind, COUNT(*) AS total,
    SUM(backfillStatus = 'backfilled') AS backfilled, SUM(backfillStatus = 'unmatched') AS unmatched,
    SUM(backfillStatus = 'mismatch') AS mismatched FROM merge_cloud_crm_invoices
  UNION ALL SELECT 'receipt', COUNT(*), SUM(backfillStatus = 'backfilled'), SUM(backfillStatus = 'unmatched'), SUM(backfillStatus = 'mismatch') FROM merge_cloud_crm_receipts`);
console.table(crm);

console.log("== 项目结算：状态与时间字段是否自洽（验收完成/已完结 应有对应时间）");
const settlementStates = await q(`
  SELECT status, COUNT(*) AS total,
         SUM(acceptanceCompletedAt IS NULL) AS missingAcceptanceCompletedAt,
         SUM(closedAt IS NULL) AS missingClosedAt
    FROM merge_po_settlement_projects GROUP BY status ORDER BY total DESC`);
console.table(settlementStates);

console.log("== 月账单对账单：明细完整性（对账单明细按 snapshotNo 关联）");
const billingCoverage = await q(`
  SELECT COUNT(*) AS confirmedStatements,
         SUM(itemCount = 0) AS withoutItems,
         SUM(itemAmount = 0) AS zeroAmount
    FROM (
      SELECT s.snapshotNo, COUNT(i.id) AS itemCount, COALESCE(SUM(i.amount), 0) AS itemAmount
        FROM merge_power_billingstatementsnapshots s
        LEFT JOIN merge_power_billingstatementsnapshotitems i ON i.snapshotNo = s.snapshotNo
       WHERE s.status = '已确认'
       GROUP BY s.snapshotNo
    ) t`);
console.table(billingCoverage);

console.log("== 月账单核销明细来源分布");
const writeOffSources = await q(`
  SELECT COALESCE(NULLIF(sourceType, ''), '(空)') AS sourceType, COUNT(*) AS rowsCount
    FROM merge_power_monthlybillingwriteoffs GROUP BY sourceType ORDER BY rowsCount DESC`);
console.table(writeOffSources);

await conn.end();
