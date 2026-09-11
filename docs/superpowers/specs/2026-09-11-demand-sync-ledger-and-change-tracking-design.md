# 需求同步台账与远端变更处理方案

编写日期：2026-09-11
涉及页面：`/requests/sync-mappings`（需求同步映射）
涉及服务：`src/lib/frappe-demand-sync-service.ts`
涉及数据：`merge_power_demand_sync_items`（同步台账）、`merge_power_demand_sync_mappings`（映射）、`merge_power_requests`（本地需求单）

## 1. 背景

用户为了测试删除了已拉取到本地的需求单，之后同步不再重新拉取；同时想确认"远端客户改需求后会不会同步更新"。本方案先说明现有机制，再给出可落地的开发方案。

## 2. 现有机制（代码事实）

### 2.1 台账

每次同步会把每条远端明细写入 `merge_power_demand_sync_items`：

| 字段 | 说明 |
| --- | --- |
| `sourceItemId` | 远端明细号（DOI-xxxxx），主键 |
| `sourceOrderId` | 远端需求单号（DO-xxxxx） |
| `localRequestNo` | 对应的本地需求单号（= 远端 customer_po_no） |
| `localRequestItemId` | 本地需求明细号（仅创建成功时写入） |
| `sourceModifiedAt` / `sourceHash` | 远端修改时间 / 内容摘要 |
| `status` | `synced` / `skipped_existing` / `pending_change` / `blocked` |

### 2.2 同步主流程（`runFrappeDemandSync`）

对每个远端需求单依次判断：

1. **本地需求单已存在** → 直接跳过（`skipped_existing`），**不比较内容**；
2. **本地需求单不存在、但台账有记录** → 逐条比对 `sourceHash`：
   - 相同 → 计入"已跳过"，什么都不做；
   - 不同 → 标记 `pending_change`，提示"远端需求已变化；本地需求单不自动覆盖，请人工核对"，**不创建、不更新**；
3. **两边都没有** → 校验映射完整性后创建本地草稿（`synced`）。

### 2.3 摘要口径

`sourceHash = sha256(明细[id, 物料, 供应商, 状态, 数量, 需求日期, modified] + 主单[id, 客户PO号, 机房, 收件人清单, modified])`。
只有状态属于可同步状态（`FRAPPE_DEMAND_ELIGIBLE_STATUS`，默认 `Committed`）的明细才会进入台账，其它状态的明细连台账记录都没有。

## 3. 实测数据（当前库 + 远端最新数据）

| 项目 | 结果 |
| --- | --- |
| 台账记录 | 96 条明细，覆盖 20 张需求单，状态全部为 `skipped_existing` |
| 这 20 张单的本地需求单 | **全部已不存在**（曾拉取/跟踪后被删除） |
| 与远端当前数据比对 hash | **0 张发生变化**，即再同步也只会静默跳过 |
| 远端总量 | 155 张需求单 / 277 条明细 |

其中 DO-00015、DO-00016 各有 3 条明细但只跟踪 2 条，正是因为第 3 条的状态不在可同步范围内（如上文 2.3）。

## 4. 问题分析

1. **看不到"曾拉取后被删除"的记录**：台账只写库，界面上没有入口，用户无法知道哪些单曾经拉取过、现在本地已删除。
2. **变更检测形同虚设**：只要本地需求单还在，分支 1 就直接跳过，远端改了什么完全不会被发现（连提示都没有）。
3. **即使检测到变更也没有落地手段**：只写 `pending_change`，没有 diff、没有应用入口，用户只能自己去远端比对。
4. **台账只有 hash，没有快照**：无法回答"具体哪个字段变了"。
5. **非可同步状态的明细不写台账**：远端把状态从 `Committed` 改成别的、或从别的改成 `Committed`，都会让明细"凭空出现/消失"，没有轨迹可查。

## 5. 开发方案

### 5.1 同步台账视图（解决"看不到哪些被删了"）

在「需求同步映射」页面新增一个标签页 **「同步台账」**（或独立页面 `/requests/sync-ledger`），按需求单聚合展示：

| 列 | 来源 |
| --- | --- |
| 远端需求单号 | `sourceOrderId` |
| 本地需求单号 | `localRequestNo` |
| 明细数 | `COUNT(*)` |
| 本地状态 | **本地已存在 / 本地已删除**（`LEFT JOIN requests` 判断） |
| 远端变更 | 台账 hash 与远端最新 hash 比对结果（未变更 / 已变更 N 条） |
| 最后同步时间 | `MAX(updatedAt)` |
| 操作 | 「重新拉取」「查看明细」 |

核心查询（"曾同步但现在本地已删除"）：

```sql
SELECT i.sourceOrderId, i.localRequestNo, COUNT(*) AS items, MAX(i.updatedAt) AS lastSyncedAt
  FROM merge_power_demand_sync_items i
  LEFT JOIN merge_power_requests r ON r.requestNo = i.localRequestNo
 WHERE r.requestNo IS NULL
 GROUP BY i.sourceOrderId, i.localRequestNo
 ORDER BY lastSyncedAt DESC;
```

分类筛选：全部 / 本地已存在 / 本地已删除 / 远端已变更 / 待处理。分页与总数复用现有 `PaginationBar` 与分页参数约定。

### 5.2 「重新拉取」操作（把删掉的单重新建回来）

为台账增加重置能力：`POST /api/integrations/frappe-demand-sync/ledger/{sourceOrderId}/reset`

- 把该需求单的台账记录标记为 `reset`（比删除更可审计），下次同步即按"两边都没有"的分支重新创建草稿；
- 或直接提供"立即重建"，只处理这一张单。

**前置条件（必须提示用户）**：远端明细状态必须仍在可同步范围内（默认 `Committed`）。例如 DO-00049 的明细都是 `Received`，即使清掉台账也不会被重建。

### 5.3 变更检测前移 + 变更明细（解决"客户改需求会不会更新"）

**结论：目前不会自动更新，也不会提示。** 建议分三层实施：

**第 1 层：变更可见（建议先做）**

1. 把 hash 比对从"本地单不存在"的分支**提前到每次同步都执行**（对台账已跟踪的明细）；
2. 台账新增 `sourceDataJson`（保存上次同步的远端明细快照），比对后可列出**具体变更字段**；
3. 变更时写 `pending_change` 并保存新旧值，同步结果与台账视图给出计数和入口；
4. 台账视图提供 diff 展示，例如：

   ```
   DOI-00127（DO-00049）  数量 20 → 25，需求发货 2026-03-28 → 2026-04-10
   ```

**第 2 层（可选）：草稿自动跟随**

仅当本地需求单状态为「草稿」且尚未下单时，允许按远端自动刷新（数量/供应商/实例型号/需求日期），并记录操作日志；已下单或已确认的单不自动改。

**第 3 层（可选）：人工确认应用**

在 diff 弹窗中人工确认后，把远端变更应用到本地（适合已下单的单，避免覆盖业务已录入的单价、承接单位等内容）。

### 5.4 台账补充记录

对状态不在可同步范围的明细，也写入台账一行（状态标记为 `out_of_scope`），这样"明细出现/消失"有迹可循，不再凭空变化。

## 6. 风险与注意

- `sourceHash` 依赖远端 `modified` 字段，远端任何保存动作都会改变 hash，可能出现"形式变更"（值没变但 modified 变了）；建议 diff 展示时按字段比较而不是只报"已变更"。
- 自动更新草稿会覆盖本地已录内容，必须限制状态范围并留操作日志。
- 「重新拉取」不能绕过映射校验：供应商/实例型号/机房的映射必须仍是 `confirmed`，否则仍会 blocked。
- 台账与本地需求单的关联键是 `localRequestNo`（远端 customer_po_no）；如果远端改了 customer_po_no，会被当成一张全新的单，需要在方案落地时明确处理方式（建议按 sourceOrderId 关联而不是只靠单号）。

## 7. 实施步骤与工作量

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 同步台账查询服务 + API（聚合、分类、分页、搜索） | 0.5 天 |
| 2 | 「同步台账」标签页（列表、分类筛选、分页、"本地已删除"高亮） | 0.5 天 |
| 3 | 「重新拉取/重置台账」接口与操作（含前置条件校验与提示） | 0.5 天 |
| 4 | 台账新增 `sourceDataJson` 列 + 迁移脚本 + 回填 | 0.5 天 |
| 5 | 变更检测前移（每次同步比对）+ 变更字段 diff | 1 天 |
| 6 | 状态不在范围明细的台账记录（`out_of_scope`） | 0.5 天 |
| 7 | 测试与验收（含 20 张已删除单的回归验证） | 0.5 天 |

合计约 **4 天**；其中第 1–3 步（约 1.5 天）即可解决"看不到哪些被删了、想重新拉取"的诉求，可以单独先上线。

## 8. 待确认问题

1. 「同步台账」是作为现有页面新增标签页，还是独立菜单页？
2. 「重新拉取」采用"重置台账 + 等下次定时同步"，还是提供"立即重建这一张单"的按钮？
3. 变更检测发现远端变更后，是否需要第 2 层（草稿自动跟随）？还是只做提示与 diff？
4. 是否需要把"状态不在可同步范围"的明细也写入台账（5.4）？
5. 台账关联改用 `sourceOrderId`（避免远端改 customer_po_no 后重复建单）是否可以接受？

## 附录：相关代码位置

```text
src/lib/frappe-demand-sync-service.ts
  :548 refreshFrappeDemandMappings     远端映射刷新
  :558 listFrappeDemandMappings        映射列表（本次已加分页/分类）
  :719 prepareLine                     映射完整性校验
  :802 runFrappeDemandSync             同步主流程（三条分支）
  :636 sourceHash                      变更摘要口径
  :643 hasEligibleStatus               可同步状态判定
src/components/frappe-demand-sync-page.tsx   需求同步映射页面
```
