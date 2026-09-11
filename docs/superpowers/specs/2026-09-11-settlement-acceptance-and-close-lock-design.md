# 项目结算：验收完成状态与"完结后锁粒度"调整方案

编写日期：2026-09-11
涉及：`merge_po_settlement_projects`、`src/lib/settlement-project-service.ts`、`src/components/settlement-project-detail-page.tsx`

## 一、新增「验收完成」状态

### 1.1 现状

状态流转（`changeSettlementStatus`）：`purchasing`（采购中）→ `procurement_completed`（采购完成，记 `procurementCompletedAt`）→ `accepting`（验收中，记 `acceptanceStartedAt`）→ `closed`（已完结，记 `closedAt` + 确认人）。

### 1.2 目标

在「验收中」和「已完结」之间增加 **`acceptance_completed`（验收完成）**，并记录**验收完成时间**：

```
采购中 → 采购完成 → 验收中 → 验收完成（新）→ 已完结
```

### 1.3 改动点

| 位置 | 改动 |
| --- | --- |
| `merge_po_settlement_projects` | 新增 `acceptanceCompletedAt DATETIME NULL`（含 `schema.sql`、`scripts/migrate.ts`、增量 SQL 与回滚） |
| `normalizeSettlementStatus` / `settlementStatusLabel` | 增加 `acceptance_completed` → 「验收完成」 |
| `changeSettlementStatus` | `accepting` 只能转入 `acceptance_completed`（写 `acceptanceCompletedAt`）；`acceptance_completed` 只能转入 `closed`（写 `closedAt` + 确认人） |
| 详情页按钮 | `accepting` → 按钮「验收完成」；`acceptance_completed` → 按钮「完结项目」 |
| 列表/导出 | 状态列、筛选、导出枚举同步增加新状态 |
| 历史数据 | 无需回填：已完结的项目保持 `closed`；如需补验收完成时间，可后续按业务口径补录 |

### 1.4 注意

- 现有「进入验收」之后的唯一出口是「完结项目」，改造后必须**先点「验收完成」再完结**，历史已完结项目不受影响。
- 若业务希望"验收完成后仍可回退到验收中"，需要额外定义回退规则（默认不支持回退）。

## 二、项目完结后的锁粒度调整

### 2.1 现状（问题根因）

两个层面的"一刀切"：

1. **后端** `assertEditable()`：`status === "closed"` 时直接抛「已完结项目不能修改」，所有写接口（采购明细、其他成本费用、销售收入、发票、附件上传/删除）一律被拒。
2. **前端** `settlement-project-detail-page` 第 73 行 `const readOnly = project.status === "closed"`，第 120 行用 `<fieldset disabled={readOnly}>` 包住整个「明细」页签。

`<fieldset disabled>` 会禁用**内部所有表单控件**（input / select / checkbox / button），所以「已采购商品」里分页、换页、列头三横杠的排序/筛选/列锁定这些**只影响展示、不改数据**的交互也被一起禁用了——这是不合理的。

### 2.2 目标

完结后应当：

| 能力 | 完结后行为 |
| --- | --- |
| 修改已采购商品 | ❌ 禁止 |
| 修改其他成本费用 | ❌ 禁止 |
| 修改销售收入明细 | ❌ 禁止 |
| 修改发票 | ❌ 禁止 |
| 上传/删除附件（附件管理、发票附件） | ✅ **允许上传**（按需求） |
| 分页、换页、列头排序/筛选/列锁定 | ✅ 正常可用 |
| 导出、查看、下载 | ✅ 正常 |
| 状态流转 | 不能再流转（已完结） |

### 2.3 改动点

**后端（按业务域拆分校验）**

- 把 `assertEditable(project)` 拆成按域的校验函数：
  - `assertItemsEditable`（已采购/未采购商品）
  - `assertExpensesEditable`（其他成本费用）
  - `assertSalesEditable`（销售收入明细）
  - `assertInvoicesEditable`（发票）
  - 附件上传/删除**不再**调用完结校验（仅校验项目存在与权限）
- 规则：`closed` 时以上四个域全部禁止写入；`acceptance_completed` / `accepting` 等阶段的限制按现有 `assertPurchasingEditable` 的口径保留（采购明细仅采购阶段可改）。

**前端（把"整页禁用"改成"按控件禁用"）**

- 去掉 `<fieldset disabled={readOnly}>` 整体包裹，改为把 `readOnly` 传给需要禁用的输入与按钮：
  - 禁用：商品行的数量/单价/币种/税率/发票号输入、保存/退回按钮、新增/保存/删除费用与销售、发票新增/保存/删除
  - 不禁用：分页、换页、列头三横杠（排序/筛选/列锁定）、导出、下载、附件上传
- 附件区：完结后**保留上传入口**（当前 `AttachmentSection` 在 `readOnly` 时隐藏了上传按钮，需要改为始终可上传；删除是否允许由业务确认）

### 2.4 需要确认

1. 完结后附件是否**允许删除**？还是只允许上传、不允许删除（更稳妥）？
2. 完结后「已采购商品」是否允许**退回（取消采购）**？按需求应禁止，但退回会影响成本，需确认。

## 三、实施步骤与工作量

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 新增 `acceptance_completed` 状态 + `acceptanceCompletedAt` 字段 + 迁移脚本 | 0.5 天 |
| 2 | 状态流转与详情页按钮、列表/导出枚举同步 | 0.5 天 |
| 3 | 后端拆分按域的写入校验，附件上传放开 | 0.5 天 |
| 4 | 前端去掉 `fieldset` 整体禁用，改为按控件禁用（保留分页/排序/筛选/列锁定） | 0.5 天 |
| 5 | 回归测试与验收（含完结项目上传附件、翻页排序筛选验证） | 0.5 天 |

合计约 **2.5 天**。

## 四、待确认

1. 「验收完成」是否需要回退到「验收中」的能力？
2. 完结后附件删除是否允许（建议只允许上传）？
3. 完结后「已采购商品」的退回是否允许（建议禁止）？
4. 是否需要在项目结算列表增加「验收完成」状态的筛选与统计。
