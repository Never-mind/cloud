# 显示规范一致性排查报告

排查日期：2026-09-17
排查范围：全部页面路由、全部列表/详情接口、全部前端表格组件
排查方式：真实接口回放（逐个接口抓返回报文）+ 源码扫描
背景：`docs/superpowers/specs/2026-09-17-datetime-display-unification-design.md` 完成第一轮统一后，继续排查同类问题

## 1. 结论概览

| 类别 | 问题数 | 严重度 |
| --- | --- | --- |
| 详情类接口仍返回原始 ISO 时间 | 7 个接口 | 高（会把时间显示错,个别会错一天） |
| `AuditInfoBar` 直接 `String(value)` | 5 个页面 | 高 |
| 前端私有日期格式化实现 | 8 处，其中 4 处会算错 | 高 |
| 金额/数字格式化各写一套 | 11 个文件 19 处 | 中 |
| 数据单元格未禁止折行 | 12 个文件 64 处 | 中 |
| 备注列截断且无 tooltip | 通用实体列表 | 中 |
| 孤立路由 / 报错接口 | 4 个路由 + 1 个接口 | 低 |

第一轮统一只解决了**列表接口 + 列表页**这条主线；**详情接口和详情页的审计信息栏没有被覆盖**，这是目前最大的残留面。

## 2. 详情类接口仍返回原始 ISO（实测）

| 接口 | 未统一的字段 | 实测值 | 真实本地时间 |
| --- | --- | --- | --- |
| `/api/order-details/requests/{id}` | `master.createdAt` / `updatedAt` / `remoteStatusUpdatedAt`、`details[].createdAt` / `updatedAt` / `requestedAt` | `2026-09-11T08:31:50.000Z` | `2026-09-11 16:31:50` |
| `/api/po/settlement-projects` | `createdAt` / `updatedAt` / `procurementCompletedAt` | `2026-09-12T03:26:03.000Z` | `2026-09-12 11:26:03` |
| `/api/po/customer-pos` | `poDate` / `deliveryDate` / `createdAt` / `updatedAt` / `confirmedAt` | `2026-09-11T16:00:00.000Z` | `2026-09-12 00:00:00` |
| `/api/cloud/mappings` | `createdAt` / `updatedAt` | `2026-08-30T00:15:38.000Z` | `2026-08-30 08:15:38` |
| `/api/cloud/supplier-payments` | `paymentUpdatedAt` | `2026-09-10T10:19:43.000Z` | `2026-09-10 18:19:43` |
| `/api/import-center` | `jobs[].createdAt` / `updatedAt` / `confirmedAt` | `2026-08-29T08:39:49.000Z` | `2026-08-29 16:39:49` |
| `/api/documents/items` | `folder.createdAt` / `updatedAt`、`folders[].createdAt` / `updatedAt` | `2026-08-28T03:49:25.000Z` | `2026-08-28 11:49:25` |

已统一、无需处理的接口（实测返回 `YYYY-MM-DD HH:mm`）：
`/api/entities/*`、`/api/orders`、`/api/po/invoices`、`/api/balance-settlements(/finals)`、`/api/cloud/rows`、`/api/capex-pricing/versions`、`/api/billing/*`、`/api/prepayment-adjustments`、`/api/internal-service-fees/*`、`/api/service-fees/snapshots`、`/api/purchase/product-lines`、`/api/requests/product-lines`、`/api/dashboard/overview`。

### 2.1 特别提醒：日期字段被当成字符串截取会差一天

`/api/po/customer-pos` 的 `poDate = 2026-09-11T16:00:00.000Z`，真实日期是 **2026-09-12**。任何 `String(value).slice(0, 10)` 的写法都会显示成 `2026-09-11`。
用 `formatDisplayValue(value, "date")` 或 `formatDateInputValue` 才会按本地换算得到 `2026-09-12`。

## 3. `AuditInfoBar` 直接渲染原始值（5 个页面）

`src/components/ui.tsx` 的 `AuditInfoBar` 对入参只做 `String(value)`，并且外层是 `truncate`：

```tsx
<span className="mt-1 block truncate text-sm text-ink-2" title={...}>{value == null || value === "" ? "-" : String(value)}</span>
```

调用点全部传入未格式化的值：

| 页面 | 文件 | 数据来源 |
| --- | --- | --- |
| 客户 PO 详情 | `customer-po-page.tsx:597` | `/api/po/customer-pos`（ISO） |
| 需求单 / 采购订单详情 | `order-detail-page.tsx:460` | `/api/order-details/*`（ISO） |
| 需求单表单 | `request-order-form-page.tsx:530` | `/api/order-details/*`（ISO） |
| 报价单列表 | `quotation-list-page.tsx:609` | 报价接口 |
| 项目结算详情 | `settlement-project-detail-workspace.tsx:276` | 传入 `formatDate()`（UTC 截取，见 4.1） |

表现：创建时间显示成 `2026-09-11T08:3…`（既错了 8 小时，又被截断）。

**建议**：`AuditInfoBar` 内部改为 `formatDisplayValue(value, "datetime")`，一次修好 5 个页面；同时删掉外层的 `truncate`（日期时间加 `whitespace-nowrap`），保留 `title`。

## 4. 前端私有的日期格式化实现（8 处）

### 4.1 会算错的 4 处

| 位置 | 写法 | 后果 |
| --- | --- | --- |
| `settlement-project-page.tsx:131` | `String(value).slice(0, 16).replace("T", " ")` | 按 UTC 截取，时间差 8 小时 |
| `settlement-project-detail-workspace.tsx:512` | 同上；并在 `legacyFormatColumnValue` 里对所有 `*At` / `*Date` 字段生效 | 项目结算详情所有时间列差 8 小时 |
| `document-manager-page.tsx:505` | `String(value).slice(0, 10)` | 文档创建/更新时间在 16:00 之后会**差一天** |
| `lib/po-invoice-summary-service.ts:107` | `raw.replace("T", " ").slice(0, withTime ? 16 : 10)` | 集采发票汇总时间差 8 小时 |

### 4.2 重复实现但结果正确（可合并，优先级低）

`capex-pricing-page.tsx:123`、`balance-settlement-page.tsx:101`、`balance-final-settlement-page.tsx:41`、`cloud-reconciliation-page.tsx:313 dateOnlyText`。

### 4.3 其他重复的数字格式化

`money()` / `formatMoney()` / `numberValue()` 在 `display-format.ts` 之外还散落在
`cloud-reconciliation-page.tsx`、`settlement-project-page.tsx`、`settlement-project-detail-workspace.tsx`、`po-invoice-summary-page.tsx`、`balance-*-page.tsx`、`purchase-price-calculation-demo-page.tsx`、`power-price-calculation-drawer.tsx`、`capex-pricing-page.tsx`、`billing-*.tsx` 等 11 个文件里，共 19 处直接调用 `toLocaleString("en-US")`。

其中一处结果不一致：
`balance-settlement-page.tsx:112` 的 `formatValue(value, "number")` 直接返回数值，**结差单明细的"数量"列没有千分位**，而其它列表（需求单、采购订单、月账单明细）都有。

## 5. 单元格换行与截断

第一轮已修：华为云 3 张表、需求单/采购订单列表、通用实体列表的日期列。

仍有 **12 个文件 64 个数据单元格**没有 `whitespace-nowrap`：

| 文件 | 数量 |
| --- | --- |
| `order-list-page.tsx` | 10 |
| `prepayment-contract-detail-page.tsx` | 15 |
| `purchase-order-form-page.tsx` | 15 |
| `request-order-form-page.tsx` | 7 |
| `frappe-demand-sync-page.tsx` | 5 |
| `balance-final-settlement-page.tsx` | 3 |
| `balance-settlement-page.tsx` | 2 |
| `capex-pricing-page.tsx` | 2 |
| `settlement-project-detail-workspace.tsx` | 2 |
| `billing-available-page.tsx` / `cloud-reconciliation-page.tsx` / `purchase-price-calculation-demo-page.tsx` | 各 1 |

### 5.1 备注列

通用实体列表（`entity-page.tsx`）的文本列统一是 `max-w-[260px] truncate`，**没有 `title`**，所以超长备注既折不了行、也看不到完整内容。
按"备注允许折行、其他禁止折行"的口径，备注应当改成可折行（`whitespace-normal break-words`）或至少补 `title`。

## 6. 顺带发现的两个隐患

### 6.1 `/api/entities/purchase-orders` 直接 500

```text
GET /api/entities/purchase-orders -> 500 {"error":"Unknown column 'countryCode' in 'field list'"}
```

原因：`src/lib/modules.ts:1265` 覆盖了采购订单配置的 `listFields`，加入了 `{ key: "countryCode", label: "国家" }`，但 `merge_power_purchaseorders` 表**没有 `countryCode` 字段**（国家在需求明细上）。

当前 UI 走 `/api/orders?mode=purchase`，所以没暴露；但通用实体列表、导入模板等入口一旦用上就会 500。

### 6.2 4 个孤立路由

页面存在、导航里没有，只能手输 URL 进入：

| 路由 | 说明 |
| --- | --- |
| `/master-data/customers` | 与 `/customers` 重复 |
| `/master-data/suppliers` | 与 `/suppliers` 重复 |
| `/master-data/undertaking-units` | 与 `/undertaking-units` 重复 |
| `/tariff-rates` | 渲染的是 `product-categories` 配置，属于改名后遗留 |

（`/login`、`/module-disabled` 是正常的路由外页面，不在清理范围。）

## 7. 建议的修复顺序

| 顺序 | 内容 | 影响面 | 预估 |
| --- | --- | --- | --- |
| 1 | `AuditInfoBar` 内部统一格式化 + 去掉 truncate | 5 个页面一次修好 | 0.5 天 |
| 2 | 7 个详情接口改为 SQL 侧 `DATE_FORMAT` 到分（或复用 `normalizeCloudDateFields` 模式） | 详情页、客户端导出 | 1 天 |
| 3 | 删除 8 处私有日期格式化，统一走 `display-format.ts` | 修掉 4 处算错 | 0.5 天 |
| 4 | 结差明细数量列改用统一数字格式；合并 money 重复实现 | 11 个文件 | 0.5 天 |
| 5 | 64 个单元格补 `whitespace-nowrap`；备注列改为可折行 + `title` | 12 个文件 | 1 天 |
| 6 | 修 `/api/entities/purchase-orders` 的 `countryCode`；删除 4 个孤立路由 | 收尾 | 0.5 天 |

合计约 4 天，全部为代码改动，**不涉及数据库结构变更**。

## 8. 建议顺手加的两条防回归约束

1. 单元测试：对 `formatDisplayValue` 增加"ISO 带 Z 必须按本地换算"用例（已完成）。
2. 约定：**新增接口的日期时间字段必须先格式化再返回**，前端拿到的日期时间字符串一定是 `YYYY-MM-DD HH:mm`；前端不再对日期时间做字符串截取。

## 9. 修复情况（2026-09-17 完成）

第 1 ~ 6 项已全部修完，实测结果如下。

### 9.1 新增的公共能力

| 位置 | 内容 |
| --- | --- |
| `display-format.ts` | 新增 `normalizeTemporalFields(value, { date, datetime })`：接口返回前统一格式化行上的日期/日期时间字段 |
| `display-format.ts` | 导出 `formatMoneyValue` / `formatNumberValue`，各页面的本地 `money()` 改为委托，保证口径一致 |

### 9.2 逐项修复

| 项 | 修复方式 |
| --- | --- |
| 1 `AuditInfoBar` | 内部按字段类型调用 `formatDisplayValue`，去掉 `truncate` 改为 `whitespace-nowrap` + `title`；5 个调用页一次性修好 |
| 2 详情接口 | `order-detail-service`、`settlement-project-service.normalizeProject`、`po/customer-pos` 路由、`listCloudMappings`、`normalizeCloudDateFields`（补 `paymentUpdatedAt`）、`import-center-service.listImportJobs`、`document-service.getDocumentItems` 全部接入 `normalizeTemporalFields` |
| 3 私有日期格式化 | 删除 `settlement-project-page` 的无用 `formatDate`、`settlement-project-detail-workspace` 的 UTC 截取实现（改为按 `*At` / `*Date` 分别走 datetime / date）、`document-manager-page` 的 `slice(0,10)`、`po-invoice-summary-service.dateText` 的 UTC 截取 |
| 4 数字格式 | 结差单明细 `number` 类型改用 `formatNumberValue`（恢复千分位）；`cloud-reconciliation`、`balance-settlement`、`balance-final-settlement`、`po-invoice-summary`、`settlement-project-page`、`settlement-project-detail-workspace` 的 money 实现统一委托 `formatMoneyValue` |
| 5 单元格 | 渲染值的单元格补 `whitespace-nowrap`；表单控件单元格（Input / NumberInput / select / Textarea）保持原样，避免把编辑格撑宽；通用实体列表的 `textarea`（备注）列改为 `whitespace-normal break-words`，可折行看全 |
| 6 收尾 | `crud.ts` 为 `purchase-orders` 增加 `countryCode` 派生表达式（按明细回查来源需求单），列表与筛选都不再引用不存在的列；删除 4 个孤立路由及其对应的权限前缀 / 导航分组判断 |

### 9.3 实测验收（2026-09-17）

接口：17 个端点全部返回已格式化值，**0 处残留 ISO**，且 `/api/entities/purchase-orders` 由 500 恢复为 200。

页面：`/`、`/cloud/reconciliation`、`/purchase/orders`、`/requests/orders`、`/requests/items`、`/po/settlement-projects`、`/po/invoices`、`/documents`、`/data-imports`、`/finance/capex-pricing`、`/finance/balance-settlements`、`/shipments`、`/customers`、`/suppliers` 共 14 个页面全部 200。

工程：`npx tsc --noEmit` 通过、318 个单测通过、`npm run build` 通过（路由数由 61 减为 57）。

### 9.4 仍未处理（需要再确认）

- `purchase-price-calculation-demo-page` / `power-price-calculation-drawer` 的 `money(value, digits)` 支持自定义小数位，属于计算预览，暂未合并到公共实现。
- `request-order-form-page`、`purchase-order-form-page`、`prepayment-contract-detail-page` 的编辑格依旧是普通单元格（未加 nowrap），因为里面是表单控件而不是展示值。
