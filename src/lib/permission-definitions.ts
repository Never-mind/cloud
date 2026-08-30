export const PERMISSION_ACTIONS = ["view", "create", "update", "delete", "export", "import", "confirm"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type PermissionFlags = {
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExport: boolean;
  canImport: boolean;
  canConfirm: boolean;
};

export type PermissionState = {
  role: string;
  grants: Record<string, number>;
};

export type PermissionDefinition = {
  moduleKey: string;
  title: string;
  level: 1 | 2 | 3;
  parentKey?: string;
  kind: "domain" | "group" | "module";
  domainKey?: "power" | "po" | "cloud" | "common";
};

const ACTION_BITS: Record<PermissionAction, number> = {
  view: 1,
  create: 2,
  update: 4,
  delete: 8,
  export: 16,
  import: 32,
  confirm: 64,
};

const MODULE_DOMAIN: Record<string, PermissionDefinition["domainKey"]> = {
  documents: "common",
  "data-imports": "common",
  "system-users": "common",
  "system-module-features": "common",
  suppliers: "common",
  customers: "common",
  "undertaking-units": "common",
  "customer-pos": "po",
  "customer-po-items": "po",
  quotations: "po",
  "quotation-items": "po",
  "settlement-projects": "po",
  "history-quotations": "po",
  "product-masters": "po",
  "product-models": "po",
  "product-specifications": "po",
  "product-categories": "po",
  "customer-product-aliases": "po",
  "customer-contacts": "common",
  "customer-bank-accounts": "common",
  "supplier-contacts": "common",
  "supplier-bank-accounts": "common",
  "undertaking-unit-contacts": "common",
  "undertaking-unit-bank-accounts": "common",
  "huawei-cloud": "cloud",
  "huawei-cloud-mappings": "cloud",
  "huawei-cloud-supplier-payments": "cloud",
};

const MODULE_GROUP: Record<string, string> = {
  countries: "基础信息",
  "delivery-locations": "基础信息",
  "delivery-contacts": "基础信息",
  datacenters: "基础信息",
  suppliers: "供应商管理",
  "instance-models": "基础信息",
  "undertaking-units": "承接单位",
  customers: "客户管理",
  "instance-contracts": "合同管理",
  requests: "客户需求",
  "request-items": "客户需求",
  "purchase-orders": "采购管理",
  "purchase-order-items": "采购管理",
  "purchase-order-sn-items": "采购管理",
  "purchase-order-plan-items": "采购管理",
  shipments: "物流管理",
  "billing-available": "财务管理",
  "billing-ledgers": "财务管理",
  "monthly-billing-writeoffs": "财务管理",
  "billing-adjustments": "合同管理",
  "billing-statements": "财务管理",
  "service-fees": "财务管理",
  "service-fee-snapshots": "财务管理",
  "service-fee-snapshot-items": "财务管理",
  "prepayment-available": "财务管理",
  "prepayment-contracts": "财务管理",
  "monthly-prepayment-writeoffs": "财务管理",
  "prepayment-writeoff-adjustments": "财务管理",
  "prepayment-contract-items": "财务管理",
  "write-off-items": "财务管理",
  "b6-type-configs": "财务管理",
  "capex-pricing": "财务管理",
  "balance-settlements": "财务管理",
  "balance-final-settlements": "财务管理",
  "non-instance-settlements": "财务管理",
  "internal-service-fee-available": "财务管理",
  "internal-service-fees": "财务管理",
  "internal-service-fee-adjustments": "财务管理",
  "internal-service-fee-snapshots": "财务管理",
  documents: "公共功能",
  "data-imports": "数据工具",
  "system-users": "账户管理",
  "system-module-features": "功能启用",
  "customer-pos": "客户PO",
  "customer-po-items": "客户PO",
  quotations: "客户PO",
  "quotation-items": "客户PO",
  "settlement-projects": "客户PO",
  "history-quotations": "客户PO",
  "product-masters": "产品管理",
  "product-models": "客户PO",
  "product-specifications": "客户PO",
  "product-categories": "产品管理",
  "customer-product-aliases": "客户PO",
  "customer-contacts": "客户管理",
  "customer-bank-accounts": "客户管理",
  "supplier-contacts": "供应商管理",
  "supplier-bank-accounts": "供应商管理",
  "undertaking-unit-contacts": "承接单位",
  "undertaking-unit-bank-accounts": "承接单位",
  "huawei-cloud": "华为云对账",
  "huawei-cloud-mappings": "华为云对账",
  "huawei-cloud-supplier-payments": "华为云对账",
};

const DOMAIN_TITLES: Record<string, string> = {
  power: "算力系统",
  po: "集采系统",
  cloud: "华为云业务",
};

const MODULE_ROOT: Record<string, string> = {
  suppliers: "domain:business-partners",
  customers: "domain:business-partners",
  "undertaking-units": "domain:business-partners",
  "customer-contacts": "domain:business-partners",
  "customer-bank-accounts": "domain:business-partners",
  "supplier-contacts": "domain:business-partners",
  "supplier-bank-accounts": "domain:business-partners",
  "undertaking-unit-contacts": "domain:business-partners",
  "undertaking-unit-bank-accounts": "domain:business-partners",
  "system-users": "domain:user-management",
  "system-module-features": "domain:user-management",
  documents: "domain:public",
  "data-imports": "domain:public",
};

const ROOT_DEFINITIONS: PermissionDefinition[] = [
  { moduleKey: "domain:power", title: "算力系统", level: 1, kind: "domain", domainKey: "power" },
  { moduleKey: "domain:po", title: "集采系统", level: 1, kind: "domain", domainKey: "po" },
  { moduleKey: "domain:cloud", title: "华为云业务", level: 1, kind: "domain", domainKey: "cloud" },
  { moduleKey: "domain:business-partners", title: "业务伙伴", level: 1, kind: "domain", domainKey: "common" },
  { moduleKey: "domain:user-management", title: "用户管理", level: 1, kind: "domain", domainKey: "common" },
  { moduleKey: "domain:public", title: "公共功能", level: 1, kind: "domain", domainKey: "common" },
];

const ADMIN_ONLY_MODULES = new Set(["system-users", "system-module-features"]);

const API_ROUTE_RULES: Array<{ prefix: string; moduleKey: string }> = [
  { prefix: "/api/system/users", moduleKey: "system-users" },
  { prefix: "/api/system/module-features", moduleKey: "system-module-features" },
  { prefix: "/api/documents", moduleKey: "documents" },
  { prefix: "/api/import-center", moduleKey: "data-imports" },
  { prefix: "/api/cloud/mappings", moduleKey: "huawei-cloud-mappings" },
  { prefix: "/api/cloud/supplier-payments", moduleKey: "huawei-cloud-supplier-payments" },
  { prefix: "/api/po/customer-pos", moduleKey: "customer-pos" },
  { prefix: "/api/po/history-quotations", moduleKey: "history-quotations" },
  { prefix: "/api/po/product-lookup", moduleKey: "product-masters" },
  { prefix: "/api/po/quotations", moduleKey: "quotations" },
  { prefix: "/api/po/settlement-projects", moduleKey: "settlement-projects" },
  { prefix: "/api/cloud", moduleKey: "huawei-cloud" },
  { prefix: "/api/requests/product-lines", moduleKey: "request-items" },
  { prefix: "/api/purchase/product-lines", moduleKey: "purchase-order-items" },
  { prefix: "/api/procurement", moduleKey: "purchase-orders" },
  { prefix: "/api/requests", moduleKey: "requests" },
  { prefix: "/api/purchase", moduleKey: "purchase-orders" },
  { prefix: "/api/orders", moduleKey: "requests" },
  { prefix: "/api/order-details", moduleKey: "requests" },
  { prefix: "/api/billing-statements", moduleKey: "billing-statements" },
  { prefix: "/api/billing/adjustments", moduleKey: "billing-adjustments" },
  { prefix: "/api/billing/monthly-writeoffs", moduleKey: "monthly-billing-writeoffs" },
  { prefix: "/api/billing/confirm", moduleKey: "billing-available" },
  { prefix: "/api/billing/available", moduleKey: "billing-available" },
  { prefix: "/api/billing", moduleKey: "billing-ledgers" },
  { prefix: "/api/capex-pricing/b6-types", moduleKey: "b6-type-configs" },
  { prefix: "/api/capex-pricing", moduleKey: "capex-pricing" },
  { prefix: "/api/balance-settlements/finals", moduleKey: "balance-final-settlements" },
  { prefix: "/api/balance-settlements", moduleKey: "balance-settlements" },
  { prefix: "/api/internal-service-fees/adjustments", moduleKey: "internal-service-fee-adjustments" },
  { prefix: "/api/internal-service-fees/available", moduleKey: "internal-service-fee-available" },
  { prefix: "/api/internal-service-fees/snapshots", moduleKey: "internal-service-fee-snapshots" },
  { prefix: "/api/internal-service-fees", moduleKey: "internal-service-fees" },
  { prefix: "/api/prepayment-adjustments", moduleKey: "prepayment-writeoff-adjustments" },
  { prefix: "/api/prepayments/monthly-writeoffs", moduleKey: "monthly-prepayment-writeoffs" },
  { prefix: "/api/prepayments/available", moduleKey: "prepayment-available" },
  { prefix: "/api/prepayments", moduleKey: "prepayment-contracts" },
  { prefix: "/api/service-fees/snapshots", moduleKey: "service-fee-snapshots" },
  { prefix: "/api/service-fees", moduleKey: "service-fees" },
];

const PAGE_ROUTE_RULES: Array<{ prefix: string; moduleKey: string }> = [
  { prefix: "/system/users", moduleKey: "system-users" },
  { prefix: "/system/module-features", moduleKey: "system-module-features" },
  { prefix: "/documents", moduleKey: "documents" },
  { prefix: "/data-imports", moduleKey: "data-imports" },
  { prefix: "/customer-pos/items", moduleKey: "customer-po-items" },
  { prefix: "/customer-pos", moduleKey: "customer-pos" },
  { prefix: "/quotation/items", moduleKey: "quotation-items" },
  { prefix: "/quotation/list", moduleKey: "quotations" },
  { prefix: "/history-quotations", moduleKey: "history-quotations" },
  { prefix: "/po/settlement-projects", moduleKey: "settlement-projects" },
  { prefix: "/product-catalog/specifications", moduleKey: "product-specifications" },
  { prefix: "/product-catalog/models", moduleKey: "product-models" },
  { prefix: "/product-catalog", moduleKey: "product-masters" },
  { prefix: "/product-categories", moduleKey: "product-categories" },
  { prefix: "/tariff-rates", moduleKey: "product-categories" },
  { prefix: "/cloud", moduleKey: "huawei-cloud" },
  { prefix: "/requests/items", moduleKey: "request-items" },
  { prefix: "/requests/orders", moduleKey: "requests" },
  { prefix: "/requests", moduleKey: "requests" },
  { prefix: "/purchase/items", moduleKey: "purchase-order-items" },
  { prefix: "/purchase/order-sn-items", moduleKey: "purchase-order-sn-items" },
  { prefix: "/purchase/order-plan-items", moduleKey: "purchase-order-plan-items" },
  { prefix: "/purchase/orders", moduleKey: "purchase-orders" },
  { prefix: "/purchase", moduleKey: "purchase-orders" },
  { prefix: "/shipments", moduleKey: "shipments" },
  { prefix: "/contracts/instance-contracts", moduleKey: "instance-contracts" },
  { prefix: "/suppliers", moduleKey: "suppliers" },
  { prefix: "/customers", moduleKey: "customers" },
  { prefix: "/undertaking-units", moduleKey: "undertaking-units" },
  { prefix: "/master-data/countries", moduleKey: "countries" },
  { prefix: "/master-data/delivery-locations", moduleKey: "delivery-locations" },
  { prefix: "/master-data/delivery-contacts", moduleKey: "delivery-contacts" },
  { prefix: "/master-data/datacenters", moduleKey: "datacenters" },
  { prefix: "/master-data/suppliers", moduleKey: "suppliers" },
  { prefix: "/master-data/instance-models", moduleKey: "instance-models" },
  { prefix: "/master-data/undertaking-units", moduleKey: "undertaking-units" },
  { prefix: "/master-data/customers", moduleKey: "customers" },
  { prefix: "/finance/b6-type-configs", moduleKey: "b6-type-configs" },
  { prefix: "/finance/capex-pricing", moduleKey: "capex-pricing" },
  { prefix: "/finance/balance-final-settlements", moduleKey: "balance-final-settlements" },
  { prefix: "/finance/balance-settlements", moduleKey: "balance-settlements" },
  { prefix: "/finance/non-instance-settlements", moduleKey: "non-instance-settlements" },
  { prefix: "/finance/internal-service-fee-available", moduleKey: "internal-service-fee-available" },
  { prefix: "/finance/internal-service-fees", moduleKey: "internal-service-fees" },
  { prefix: "/finance/internal-service-fee-adjustments", moduleKey: "internal-service-fee-adjustments" },
  { prefix: "/finance/internal-service-fee-snapshots", moduleKey: "internal-service-fee-snapshots" },
  { prefix: "/finance/prepayment-contract-items", moduleKey: "prepayment-contract-items" },
  { prefix: "/finance/write-off-items", moduleKey: "write-off-items" },
  { prefix: "/finance/billing-adjustments", moduleKey: "billing-adjustments" },
  { prefix: "/finance/billing-available", moduleKey: "billing-available" },
  { prefix: "/finance/monthly-billing-writeoffs", moduleKey: "monthly-billing-writeoffs" },
  { prefix: "/finance/billing-ledgers", moduleKey: "billing-ledgers" },
  { prefix: "/finance/billing-statements", moduleKey: "billing-statements" },
  { prefix: "/finance/prepayment-writeoff-adjustments", moduleKey: "prepayment-writeoff-adjustments" },
  { prefix: "/finance/prepayment-available", moduleKey: "prepayment-available" },
  { prefix: "/finance/monthly-prepayment-writeoffs", moduleKey: "monthly-prepayment-writeoffs" },
  { prefix: "/finance/prepayment-contracts", moduleKey: "prepayment-contracts" },
  { prefix: "/finance/service-fee-snapshots", moduleKey: "service-fee-snapshots" },
  { prefix: "/finance/service-fees", moduleKey: "service-fees" },
];

function routeMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getMethodAction(pathname: string, method: string): PermissionAction {
  if (pathname.includes("/confirm")) return "confirm";
  if (pathname.includes("/export")) return "export";
  if (pathname.includes("/import")) return "import";
  if (pathname.startsWith("/api/import-center/") && pathname.includes("/preview")) return "import";
  if (method === "GET" || method === "HEAD") return "view";
  if (method === "POST") return "create";
  if (method === "PUT" || method === "PATCH") return "update";
  if (method === "DELETE") return "delete";
  return "view";
}

export function getRoutePermission(pathname: string, method = "GET") {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (normalizedPath.startsWith("/api/entities/")) {
    const entityKey = normalizedPath.slice("/api/entities/".length).split("/", 1)[0];
    return { moduleKey: entityKey, action: getMethodAction(normalizedPath, method) };
  }
  const rules = normalizedPath.startsWith("/api/") ? API_ROUTE_RULES : PAGE_ROUTE_RULES;
  const matched = rules.find((rule) => routeMatches(normalizedPath, rule.prefix));
  return matched ? { moduleKey: matched.moduleKey, action: getMethodAction(normalizedPath, method) } : null;
}

export function permissionBit(action: PermissionAction) {
  return ACTION_BITS[action];
}

export function permissionMask(flags: Partial<PermissionFlags>) {
  return PERMISSION_ACTIONS.reduce((mask, action) => {
    const key = `can${action[0].toUpperCase()}${action.slice(1)}` as keyof PermissionFlags;
    return flags[key] === true ? mask | ACTION_BITS[action] : mask;
  }, 0);
}

export function getPermissionParentKeys(moduleKey: string) {
  const domainKey = MODULE_DOMAIN[moduleKey] ?? "power";
  const groupTitle = MODULE_GROUP[moduleKey];
  const rootKey = MODULE_ROOT[moduleKey] ?? `domain:${domainKey}`;
  return [
    ...(groupTitle ? [`group:${rootKey}:${groupTitle}`] : []),
    rootKey,
  ];
}

export function hasPermission(state: PermissionState | null | undefined, moduleKey: string, action: PermissionAction) {
  if (!state || state.role === "admin") return true;
  if (ADMIN_ONLY_MODULES.has(moduleKey)) return false;
  const requiredBit = ACTION_BITS[action];
  return [moduleKey, ...getPermissionParentKeys(moduleKey)].some((key) => (state.grants[key] ?? 0) & requiredBit);
}

export function getPermissionDefinitions(entityDefinitions: Array<{ key: string; title: string; navGroup: string; adminOnly?: boolean }>) {
  const definitions: PermissionDefinition[] = [...ROOT_DEFINITIONS];
  const seenGroups = new Set<string>();
  for (const entity of entityDefinitions) {
    const domainKey = MODULE_DOMAIN[entity.key] ?? "power";
    const groupTitle = MODULE_GROUP[entity.key] ?? entity.navGroup;
    const rootKey = MODULE_ROOT[entity.key] ?? `domain:${domainKey}`;
    const groupKey = `group:${rootKey}:${groupTitle}`;
    if (!seenGroups.has(groupKey)) {
      seenGroups.add(groupKey);
      definitions.push({
        moduleKey: groupKey,
        title: groupTitle,
        level: 2,
        kind: "group",
        parentKey: rootKey,
        domainKey,
      });
    }
    definitions.push({ moduleKey: entity.key, title: entity.title, level: 3, kind: "module", parentKey: groupKey, domainKey });
  }
  return definitions;
}
