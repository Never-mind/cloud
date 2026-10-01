/**
 * 接口冒烟自检（只读）：把系统主要列表 / 筛选候选 / 导出入口扫一遍，
 * 用于部署后快速确认"服务起来了、关键接口都能返回"。
 *
 * 用法：
 *   npm run smoke:check                        对本机 5174 端口
 *   BASE_URL=http://127.0.0.1:3000 npm run smoke:check
 *   SMOKE_EMAIL=admin@luzcorp.com SMOKE_PASSWORD=xxx npm run smoke:check
 */
const base = (process.env.BASE_URL ?? "http://127.0.0.1:5174").replace(/\/+$/, "");
const email = process.env.SMOKE_EMAIL ?? "admin@luzcorp.com";
const password = process.env.SMOKE_PASSWORD ?? email;

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error(`登录失败（${login.status}）：请检查 SMOKE_EMAIL / SMOKE_PASSWORD`);
  process.exit(1);
}
const cookie = (login.headers.getSetCookie?.() ?? []).map((value) => value.split(";")[0]).join("; ");
const headers = { cookie };

const LIST_TARGETS = [
  ["首页概览", "/api/dashboard/overview"],
  ["我的通知", "/api/notifications"],
  ["通知规则", "/api/notifications/rules"],
  ["用户列表", "/api/system/users"],
  ["功能开关", "/api/system/module-features"],
  ["客户档案", "/api/entities/customers?page=1&pageSize=5"],
  ["供应商档案", "/api/entities/suppliers?page=1&pageSize=5"],
  ["承接单位档案", "/api/entities/undertaking-units?page=1&pageSize=5"],
  ["实例型号", "/api/entities/instance-models?page=1&pageSize=5"],
  ["实例合同", "/api/entities/instance-contracts?page=1&pageSize=5"],
  ["需求单", "/api/entities/requests?page=1&pageSize=5"],
  ["需求明细", "/api/entities/request-items?page=1&pageSize=5"],
  ["采购订单", "/api/entities/purchase-orders?page=1&pageSize=5"],
  ["采购明细", "/api/entities/purchase-order-items?page=1&pageSize=5"],
  ["物流列表", "/api/entities/shipments?page=1&pageSize=5"],
  ["月账单台账", "/api/billing/monthly-writeoffs?page=1&pageSize=5"],
  ["待生成月账单", "/api/billing/available?page=1&pageSize=5"],
  ["月账单对账单", "/api/billing-statements?page=1&pageSize=5"],
  ["预付款合同", "/api/entities/prepayment-contracts?page=1&pageSize=5"],
  ["待生成预付款", "/api/prepayments/available?page=1&pageSize=5"],
  ["预付款每月核销", "/api/entities/monthly-prepayment-writeoffs?page=1&pageSize=5"],
  ["服务费对账单", "/api/entities/service-fee-snapshots?page=1&pageSize=5"],
  ["项目结算", "/api/po/settlement-projects?page=1&pageSize=5"],
  ["客户PO", "/api/entities/customer-pos?page=1&pageSize=5"],
  ["报价单", "/api/entities/quotations?page=1&pageSize=5"],
  ["华为云账单", "/api/cloud/rows?page=1&pageSize=5"],
  ["华为云服务映射", "/api/cloud/mappings?page=1&pageSize=5"],
  ["华为云供应商付款", "/api/cloud/supplier-payments?page=1&pageSize=5"],
  ["CRM 发票", "/api/cloud/crm-invoices?page=1&pageSize=5"],
  ["CRM 回款", "/api/cloud/crm-invoices?kind=receipts&page=1&pageSize=5"],
  ["CRM 客户映射", "/api/cloud/crm-invoices?view=mappings"],
  ["CRM 最近同步", "/api/cloud/crm-invoices?view=last-run"],
  ["物料同步状态", "/api/integrations/material-sync"],
  ["文档库目录", "/api/documents/tree"],
  ["文档库列表", "/api/documents/items?folderId=ROOT"],
];

const FILTER_FIELDS = ["customerName", "supplierName", "undertakingUnitName", "contractingUnitName", "status"];
const FILTER_ENTITIES = ["requests", "purchase-orders", "shipments", "customer-pos", "quotations", "settlement-projects", "prepayment-contracts", "billing-statements"];

const EXPORT_TARGETS = [
  ["需求单导出", "/api/entities/requests/export?page=1"],
  ["采购订单导出", "/api/entities/purchase-orders/export?page=1"],
  ["物流导出", "/api/entities/shipments/export?page=1"],
  ["实例合同导出", "/api/entities/instance-contracts/export?page=1"],
  ["华为云导出", "/api/cloud/rows/export?page=1"],
  ["CRM 发票导出", "/api/cloud/crm-invoices/export?page=1"],
  ["华为云导入模板", "/api/cloud/template"],
  ["项目结算导出", "/api/po/settlement-projects/export"],
];

const failures = [];
const check = async (label, path) => {
  const response = await fetch(`${base}${path}`, { headers });
  if (response.ok) return true;
  const detail = await response.text().catch(() => "");
  failures.push(`✘ ${label.padEnd(18)} ${response.status} ${path}\n     ${detail.replace(/\s+/g, " ").slice(0, 140)}`);
  return false;
};

let checked = 0;
for (const [label, path] of LIST_TARGETS) { checked += 1; await check(label, path); }
for (const entity of FILTER_ENTITIES) {
  for (const field of FILTER_FIELDS) { checked += 1; await check(`${entity}.${field} 筛选`, `/api/entities/${entity}/filter-options?field=${field}`); }
}
for (const [label, path] of EXPORT_TARGETS) { checked += 1; await check(label, path); }

console.log(failures.length ? failures.join("\n") : "✔ 全部通过");
console.log(`\n共检查 ${checked} 个入口，异常 ${failures.length} 个（${base}）`);
process.exit(failures.length ? 1 : 0);
