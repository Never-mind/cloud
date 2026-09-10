# 月账单 / 预付款待生成实例按类型限制方案

编写日期：2026-09-10
涉及页面：`/finance/billing-available`（待生成月账单实例）、`/finance/prepayment-available`（待生成预付款实例）
涉及服务：`src/lib/billing-service.ts`、`src/lib/prepayment-service.ts`

## 1. 目标

采购订单确认后，只有实例型号类型为 **Equipment（设备）** 的明细可以进入：

- 待生成月账单实例（生成 60 个月账单）
- 待生成预付款实例（生成预付款合同草稿）

类型为 **Component（组件）**、**Material（配件）** 的明细不再出现在这两个列表中，也不能通过这两个入口生成台账/合同。

## 2. 现状

### 2.1 数据来源

两个列表都来自同一张源表组合：`purchaseorderitems`（采购明细）→ `requestitems`（需求明细）→ `instancemodels`（实例型号，按 `im.deviceCode = ri.deviceCode` 关联）。

| 页面 | 列表接口 | 服务函数 | 生成动作 | 生成入口复用的函数 |
| --- | --- | --- | --- | --- |
| 待生成月账单实例 | `GET /api/billing/available` | `listAvailableBillingLines`（billing-service.ts:250） | `POST /api/billing/confirm` | `confirmBillingLedgers` → 同样调用 `listAvailableBillingLines`（billing-service.ts:418） |
| 待生成预付款实例 | `GET /api/prepayments/available` | `listAvailablePrepaymentLines`（prepayment-service.ts:50） | `POST /api/prepayments/drafts` | `createPrepaymentDraft…` → 同样调用 `listAvailablePrepaymentLines`（prepayment-service.ts:216） |

因为"生成"动作也是先调同一个列表函数再落库，所以**只要在服务层的过滤条件下手，列表和生成两个入口会同时被约束**，不需要在前端或接口层额外拦截。

### 2.2 现有的过滤条件

月账单（billing-service.ts:260）：

```sql
po.status LIKE '%确认%'                       -- 采购订单已确认
AND req.status <> '草稿'                       -- 需求单非草稿
AND NOT EXISTS (... billinginstanceledgers ...) -- 未生成月账单台账
AND COALESCE(poi.requestType, ri.requestType, req.requestType, '整机') <> '备件'
```

预付款（prepayment-service.ts:60）：

```sql
po.status LIKE '%确认%'
AND req.status <> '草稿'
AND NOT EXISTS (... prepaymentcontractitems 草稿/已确认 ...)
```

**目前两个查询都没有按实例型号类型（`im.instanceType`）过滤**，因此 Equipment / Component / Material 都会进入列表。

> 注意区分两个维度：`requestType`（整机 / 备件 / …）是需求类型，`instanceType`（Equipment / Component / Material）是实例型号类型。另外结差模块代码里的参数名 `instanceType` 实际表示 `itemType`（实例 / 备件），不是本方案的实例型号类型，改动时不要混淆。

### 2.3 本地数据实测（开发库 `merge`）

| 口径 | 结果 |
| --- | --- |
| 已确认 PO 明细 | 278 条：Equipment 277、**无实例型号 1**、Component/Material 0 |
| 当前待生成月账单实例 | 3 条，全部 Equipment |
| 当前待生成预付款实例 | 277 条：Equipment 276、无实例型号 1 |

无实例型号的那条是 `POI-PO-SYS-20260829-192822-19A1-001`（PO-20260829001 / deviceCode `061120260829`），本地主数据里没有该设备编码。

本地库目前还没有 Component/Material 的实例型号（远端同步尚未执行），但**生产库预计已存在**（老同步逻辑按 item code 建档并把类型写成 Material），所以这次改动在生产上的可见效果会更明显。

## 3. 改动点（共 4 处）

两个服务各有"列表查询"和"筛选候选项查询"两处，都要加同样的条件，否则筛选下拉里会出现实际列表查不到的值：

| 文件 | 函数 | 位置 |
| --- | --- | --- |
| billing-service.ts | `listAvailableBillingLines` | 第 260 行 conditions 数组 |
| billing-service.ts | `listAvailableBillingLineFilterOptions` | 第 400 行附近 conditions 数组 |
| prepayment-service.ts | `listAvailablePrepaymentLines` | 第 60 行 conditions 数组 |
| prepayment-service.ts | `listAvailablePrepaymentLineFilterOptions` | 第 163 行附近 conditions 数组 |

建议抽成一个共享常量，避免四处写法不一致，例如放在 `instance-model-type.ts`：

```ts
/** 财务流程只允许设备类型实例进入月账单与预付款。 */
export const EQUIPMENT_ONLY_CONDITION = `COALESCE(NULLIF(im.instanceType, ''), 'Equipment') = 'Equipment'`;
```

## 4. 过滤口径（需要确认）

有两种写法，差别只在"实例型号未维护（`im` 关联不到）"的行上：

**口径 A（宽松，推荐）**

```sql
COALESCE(NULLIF(im.instanceType, ''), 'Equipment') = 'Equipment'
```

- 实例型号未维护的行**保持现状**，仍会出现在两个列表里。
- 理由：这类行既不是 Component 也不是 Material，直接隐藏会让历史整机数据从财务流程里"静默消失"，可能出现该收的账单收不到且不易察觉。本地就有 1 条这种情况。

**口径 B（严格）**

```sql
im.instanceType = 'Equipment'
```

- 未维护实例型号的行也会被排除，两个列表"只可能出现 Equipment"。
- 代价：需要在验收时逐条确认受影响的明细（本地 1 条），并推动业务补齐设备编码主数据。

## 5. 影响面

- **存量数据不回滚**：已经生成的月账单台账（`billinginstanceledgers`）和预付款合同明细（`prepaymentcontractitems`）保持原样；这些行本来就被 `NOT EXISTS` 排除在"待生成"之外，改动不会影响它们。
- **类型被修改的情况**：某条明细的实例型号类型后来被改成 Component/Material，它仍保留已生成的台账/合同，只是不再出现在待生成列表。
- **服务费**：服务费基于月账单核销生成，月账单不再产生 ⇒ 组件/配件自然也不会进入服务费流程，无需额外改动。
- **结差（可选扩展）**：`balance-settlement-service.ts:303` 的"实例结差待生成"列表同样关联了 `instancemodels`，目前**不限制类型**。如果不同步处理，会出现"月账单/预付款只收设备，结差仍收组件/配件"的口径不一致（见第 7 节问题 2）。
- **前端**：两个页面本身不用改代码（列表来自接口）；可选加一行说明文案，例如"仅显示 Equipment（设备）类型的已确认实例"。

## 6. 验证方式

1. 本地库造数验证：临时插入 1 条 Component、1 条 Material 的实例型号 + 对应的已确认 PO 明细，确认：
   - `GET /api/billing/available` 与 `GET /api/prepayments/available` 都不再返回这两条；
   - 直接调 `POST /api/billing/confirm`、`POST /api/prepayments/drafts` 带上被过滤的 `purchaseOrderItemId`，返回"所选实例已被占用或不满足生成条件"；
   - Equipment 的明细数量不变；
   - 验证后清理临时数据。
2. 相邻回归：确认这两个页面的筛选候选项（国家、批次、PO 等）与实际列表一致，没有出现"候选有、列表空"的字段。
3. `npm test` + `npx tsc --noEmit` + `npm run build`。

## 7. 待确认问题

1. **口径选 A（宽松）还是 B（严格）？** 差别只在"实例型号未维护"的明细上，本地当前有 1 条（PO-20260829001）。
2. **是否一并限制"实例结差待生成"列表？** 建议一并处理，保持财务口径一致；如果要单独处理也可以，改动方式相同（多 2 处：列表 + 筛选候选项）。
3. **是否需要在前端加说明文案？** 例如在两个列表页标题下注明"仅显示设备类型实例"。
4. **存量数据确认**：已生成的月账单台账 / 预付款合同里如果已经有组件、配件，确认保持不动（本方案默认不动）。

## 8. 实施步骤与工作量

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 抽出共享过滤条件常量，接入 4 处查询（月账单 2 处 + 预付款 2 处） | 0.3 天 |
| 2 | 本地造数验证列表过滤与生成拦截，再清理临时数据 | 0.3 天 |
| 3 | （可选）结差待生成列表同步限制 | 0.2 天 |
| 4 | （可选）前端说明文案 | 0.1 天 |
| 5 | 回归测试、构建、验收 | 0.3 天 |

合计约 **1 天**（不含可选项约 0.6 天）。

## 附录：相关代码位置

```text
src/lib/billing-service.ts:250   listAvailableBillingLines
src/lib/billing-service.ts:390   listAvailableBillingLineFilterOptions
src/lib/billing-service.ts:418   confirmBillingLedgers（生成月账单，复用列表函数）
src/lib/prepayment-service.ts:50  listAvailablePrepaymentLines
src/lib/prepayment-service.ts:155 listAvailablePrepaymentLineFilterOptions
src/lib/prepayment-service.ts:216 生成预付款合同草稿（复用列表函数）
src/lib/balance-settlement-service.ts:262 实例结差待生成候选（可选扩展）
src/lib/instance-model-type.ts    实例型号类型定义（建议放共享过滤条件常量）
```
