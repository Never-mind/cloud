# 日期时间显示统一方案

编写日期：2026-09-17
触发问题：华为云对账的「创建日期 / 更新日期」显示到秒，并且会折成两行
涉及范围：华为云对账全部列表页 + 系统内其余日期时间列

## 1. 问题现象

华为云业务 → 跨月对账台账 / 供应商付款（含展开的账号明细）里，「创建日期」「更新日期」显示成：

```text
2026-08-30 08:23:09
```

两个问题：

1. **多显示了秒**，业务只需要到分。
2. **会折行**：单元格没有禁止换行，宽度不够时 `2026-08-30` 和 `08:23:09` 被拆成两行，行高被撑高，整张表看起来参差不齐。

## 2. 实测证据

### 2.1 接口返回本身就不统一

| 接口 | `createdAt` 实际返回 | 说明 |
| --- | --- | --- |
| `/api/entities/customers` | `"2026-08-28 23:07"` | 已在 SQL 里格式化到分 |
| `/api/cloud/rows` | `"2026-08-30T00:23:09.000Z"` | 原始 ISO，带秒 |
| `/api/cloud/supplier-payments` | `"2026-09-12T02:57:53.000Z"` | 原始 ISO，带秒 |

普通实体列表在 SQL 侧统一用了 `DATE_FORMAT(x, '%Y-%m-%d %H:%i')`（`src/lib/table-query.ts` 的 `formatTableDateTimeExpression`），华为云两个接口没有走这条规则，直接把 `Date` 对象交给 JSON 序列化，所以是 UTC ISO 全精度。

### 2.2 时区没有问题

数据库实际值（`merge_cloud_rows`，批次 `HC-202607-389318`）：本地时间 `2026-08-30 08:23:09`。
接口返回 `2026-08-30T00:23:09.000Z`，前端用 `new Date()` 转回本地正是 `08:23:09`。
→ **问题只在「带秒」和「不换行」，不是时区偏差。**

### 2.3 渲染层的三套实现

| 位置 | 实现 | 结果 |
| --- | --- | --- |
| 实体列表 / 大部分业务页 | `src/lib/display-format.ts` → `formatDateTimeLikeString` | `YYYY-MM-DD HH:mm` ✅ |
| 华为云对账 | `cloud-reconciliation-page.tsx:297` 私有 `dateTimeText` | `YYYY-MM-DD HH:mm:ss` ❌ |
| 集采发票汇总 | `po-invoice-summary-page.tsx:194` 私有实现 | `slice(0,16)` ✅（但是第二份重复实现） |

### 2.4 单元格换行

华为云对账的数据单元格是：

```jsx
<td className="border-b border-r border-line-soft px-3 py-3 align-top">
```

**没有 `whitespace-nowrap`**，而表头 `<th>` 有，所以表头是单行、内容会折行。

其它页面的现状：

| 页面 | 单元格 |
| --- | --- |
| 月账单明细、内部服务费、结差单、归档批次、导入中心等 | 已有 `whitespace-nowrap` ✅ |
| `order-list-page.tsx`（需求单 / 采购订单列表） | `createdAt` / `updatedAt` 单元格没有 nowrap ❌ |
| 通用实体列表（`entity-page.tsx`） | 用 `truncate`，单行但会截断成 `2026-08-30 08:2…` ⚠️ |

### 2.5 列名也不统一

同一个 `createdAt`，全系统出现两种叫法（统计口径：全部 `.ts/.tsx`）：

| 标签 | 次数 | | 标签 | 次数 |
| --- | --- | --- | --- | --- |
| 创建时间 | 34 | | 创建日期 | 20 |
| 更新时间 | 34 | | 更新日期 | 19 |
| 确认时间 | 12 | | 确认日期 | 9 |

## 3. 方案

### 3.1 格式规范（统一口径）

| 类型 | 统一格式 | 示例 |
| --- | --- | --- |
| 日期时间 | `YYYY-MM-DD HH:mm`（到分，不带秒） | `2026-08-30 08:23` |
| 纯日期 | `YYYY-MM-DD` | `2026-08-30` |
| 例外：需要秒级排查的场景（操作日志） | 保留 `YYYY-MM-DD HH:mm:ss` | — |

### 3.2 数据来源统一（根因修复）

华为云两个接口的 `createdAt` / `updatedAt` / `confirmedAt` 改走与实体列表相同的 SQL 侧格式化：

```sql
DATE_FORMAT(x, '%Y-%m-%d %H:%i')
```

改动点：`src/lib/cloud-service.ts` 的 `listCloudRows` / `listCloudSupplierPayments` / 展开子表查询，复用 `src/lib/table-query.ts` 的 `formatTableDateTimeExpression`。

好处：前端不再需要猜格式，**导出、筛选、排序与列表用同一份值**，后续新增字段不会又冒出一套。

### 3.3 渲染层收敛

- 删除 `cloud-reconciliation-page.tsx` 的私有 `dateTimeText`。
- 删除 `po-invoice-summary-page.tsx:194` 的行内实现。
- 所有页面统一调用 `src/lib/display-format.ts` 的 `formatDisplayValue(value, "datetime")`。
- `display-format.ts` 增加秒级例外入口（如 `type === "datetime-seconds"`），给操作日志用，其余一律到分。
- 补测试：`display-format.test.ts` 增加「ISO 带秒 → 到分」「`2026-08-30T00:23:09.000Z` → 本地化后到分」用例。

### 3.4 样式统一

| 规则 | 内容 |
| --- | --- |
| 禁止换行 | 所有数据单元格统一加 `whitespace-nowrap`（当前缺的是华为云对账 3 张表 + 需求单/采购订单列表 2 处） |
| 列宽 | 日期时间列给 `min-w-[148px]`（`YYYY-MM-DD HH:mm` 在 14px 字号下约 124px，加左右各 12px padding） |
| 通用实体列表 | 日期 / 日期时间列由 `truncate` 改为 `whitespace-nowrap`，不再出现 `2026-08-30 08:2…`；文本列保留 `truncate` |
| 对齐 | 日期时间列统一左对齐，`align-top` 与其它列一致 |

建议在 `src/components/ui.tsx` 或表格工具里加两个常量类名，避免下次又各写一套：

```ts
export const dateTimeCellClass = "whitespace-nowrap ... min-w-[148px]";
export const dateCellClass = "whitespace-nowrap ... min-w-[110px]";
```

### 3.5 列名统一

统一为「**创建时间 / 更新时间 / 确认时间**」（多数派 34 / 34 / 12），需要改的：

| 原标签 | 数量 | 改成 |
| --- | --- | --- |
| 创建日期 | 20 | 创建时间 |
| 更新日期 | 19 | 更新时间 |
| 确认日期 | 9 | 确认时间 |

涉及 `cloud-reconciliation-page.tsx`、`order-list-page.tsx`、`billing-statement-detail-page.tsx`、`capex-pricing-page.tsx`、`internal-service-fee-snapshots-page.tsx`、`service-fees-page.tsx`、`writeoff-export-columns.ts` 等；导出列名同步改，保持列表与导出一致。

## 4. 影响面

| 层面 | 文件 | 说明 |
| --- | --- | --- |
| 接口 | `src/lib/cloud-service.ts` | 3 处查询加 `DATE_FORMAT` |
| 页面 | `cloud-reconciliation-page.tsx` | 3 张表：折行 + 秒 + 列名 |
| 页面 | `order-list-page.tsx` | 2 处单元格 nowrap + 列名 |
| 页面 | `po-invoice-summary-page.tsx` | 删除私有实现 |
| 通用 | `src/lib/display-format.ts` | 秒级例外入口 + 注释 |
| 通用 | `src/components/entity-page.tsx` | 日期列不再截断 |
| 文档 | `src/lib/writeoff-export-columns.ts` 等导出列 | 列名同步 |
| 文档 | `部署文档.md` / `开发者文档.md` | 补一条显示规范 |

数据库无结构变更，**上线不需要执行任何数据库命令**。

## 5. 工作量

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 华为云接口改为 SQL 侧格式化 | 0.5 天 |
| 2 | 渲染层收敛 + 秒级例外入口 | 0.5 天 |
| 3 | 单元格 nowrap + 列宽常量 | 0.5 天 |
| 4 | 列名统一（含导出列） | 0.5 天 |
| 5 | 测试 + `npm test` + `npm run build` + 页面核对 | 0.5 天 |

合计约 2 天。

## 6. 需要确认

1. 列名统一到「创建时间 / 更新时间 / 确认时间」是否可以？（现在是"日期"和"时间"混用）
2. 操作日志页面是否保留秒？（建议保留，它本来就是排查用的）
3. 是否所有列表都要禁止折行？个别备注类超长文本列仍建议保留自动折行。
