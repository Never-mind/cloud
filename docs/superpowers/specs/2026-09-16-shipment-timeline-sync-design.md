# 远端 Shipment 时间节点接入开发方案

编写日期：2026-09-16
涉及远端：`http://192.168.2.27:1337`（Frappe），Doctype `SL Shipment`
涉及本地：`merge_power_shipments`、`merge_power_requestitems`、`merge_power_demand_sync_items`
上一版方案：`docs/superpowers/specs/2026-09-10-release-logistics-integration-design.md`（Release 级实体未落地）

## 1. 目标

1. 把远端 `SL Shipment` 的时间段字段拉到本地，并按映射表写入物流列表的时间列。
2. 明确「一个需求单号对应多个实例/备件、本地一条明细一行」时的归属规则。
3. 保持既有口径：远端有值即以远端为准，本地手工/导入的值在没有远端值时保留。

## 2. 远端实测样例（2026-09-16）

### 2.1 SHP-00120 单据原文

```json
{
  "name": "SHP-00120",
  "edi_order": "EDI-00154",
  "actual_ready_at": "2025-01-22 14:57:43",
  "actual_shipped_at": "2025-01-25 10:00:23",
  "customs_cleared_date": "2025-02-10",
  "signed_date": "2025-02-12",
  "waybill_no": "TM2501250003"
}
```

完整关联链：

```text
SL Shipment SHP-00120
  └─ EDI Order EDI-00154  (release_id = 2168189798399868940, supplier = BP-003)
       └─ Demand Order DO-00125 (customer_po_no = eSHWC241230ed75, transport_mode = Air, datacenter = DC-006)
            └─ Demand Order Item DOI-00227 (material = MAT-00025, quantity = 16, status = Received)
```

### 2.2 多明细样例：`eSHWC260111d0e8` → DO-00038

```text
Demand Order DO-00038 (customer_po_no = eSHWC260111d0e8, transport_mode = Air, datacenter = DC-011)
  └─ EDI Order EDI-00054 (release_id = 2453213706594025483, supplier = BP-003)
       └─ DOI-00116 (material = MAT-00001, quantity = 4, Received)
            └─ SL Shipment SHP-00032
                 actual_ready_at      = 2026-02-02 10:04:18
                 actual_shipped_at    = 2026-02-04 09:26:40
                 actual_departed_at   = 2026-02-05 06:19:00
                 actual_arrived_at    = 2026-02-10 00:41:00
                 customs_cleared_date = 2026-02-10
                 signed_date          = 2026-02-20
                 waybill_no            = TM2602030135
```

### 2.3 一个需求单跨多个 Release / 多个 Shipment 的真实样例：DO-00049

`customer_po_no = eSHWC251217d81j`，7 条明细，分属 **4 个 Release**，其中 2 个已生成物流单且时间完全不同：

| Release ID | EDI Order | 覆盖 DOI | SL Shipment | signed_date | actual_ready_at |
| --- | --- | --- | --- | --- | --- |
| 2429742620847112194 | EDI-00043 | DOI-00127 / 00129 / 00131 / 00132 | SHP-00021 | 2026-03-02 | 2026-01-14 20:06:08 |
| 2549108128588234769 | EDI-00057 | DOI-00133 | SHP-00035 | 2026-02-27 | 2026-01-23 00:00:00 |
| 2549077282133114885 | EDI-00058 | DOI-00130（Cancelled） | 无 | — | — |
| 2542407112021508100 | EDI-00059 | DOI-00128 | 无 | — | — |

这张单是「时间不能按需求单号写」的直接证据：同一个需求单的两条明细，签收日相差 3 天。

### 2.4 全量统计（2026-09-16 实测）

| 项目 | 实测值 |
| --- | --- |
| Demand Order | 155 |
| EDI Order | 163 |
| SL Shipment | 123 |
| Demand Order Item | 277 |
| DOI → Release 归属 | 277/277，**0 冲突**（一个 DOI 只属于一个 Release） |
| 有明细的需求单 | 154 |
| 明细数分布 | 1 条×134、2 条×5、3 条×3、4 条×1、5 条×1、6 条×2、7 条×1、8 条×4、9 条×1、15 条×1、40 条×1 |
| **明细数 > 1 的需求单** | **20 张** |
| Release 数分布 | 1 个×147、2 个×6、4 个×1 |
| **跨多个 Release 的需求单** | **7 张** |
| **跨多个 Shipment（时间不同）的需求单** | **3 张**（DO-00049、DO-00086、DO-00087） |
| 单个 Release 覆盖的最大明细数 | 40 |
| 尚无 SL Shipment 的 Release | 40 |

### 2.5 `SL Shipment` 字段填充率（123 张）

| 字段 | 含义 | 填充率 |
| --- | --- | --- |
| `name` | 远端物流单号 | 100% |
| `edi_order` | 关联 EDI 单 | 100% |
| `customs_cleared_date` | 清关完成 | 93% |
| `actual_ready_at` | 实际备货完成 | 89% |
| `signed_date` | 签收 | 89% |
| `actual_shipped_at` | 实际发货 | 85% |
| `waybill_no` | 运单号 | 77% |
| `freight_booked_at` | 订舱 | 67% |
| `transport_identifier` | 运单标识 | 63% |
| `actual_departed_at` / `actual_arrived_at` | 实际起飞/到港 | 62% |
| `estimated_departed_at` | 预计起飞 | 53% |
| `estimated_arrived_at` | 预计到港 | 50% |
| `incoterm` | 贸易条款 | 11% |
| `master_bill_no` / `carrier_code` / `inland_carrier` / `international_carrier` / `tracking_remarks` | 主单/承运/轨迹 | 7～9% |
| `origin_port_code` / `destination_port_code` | 起运/目的港 | 5% |

结论：**6 个实际时间节点（ready / shipped / departed / arrived / customs cleared / signed）是主数据，填充率 62%～93%**；运单与承运商字段填充率低，作为附加信息展示即可。

## 3. 本地现状（2026-09-16 实测）

### 3.1 已实现

- `merge_power_shipments` 已有远端快照列：`remoteDemandOrderId`、`remoteDatacenterId`、`remoteDeliveryLocationId`、`remoteRecipientListId`、`remoteLogisticsSourceStatus`、`remoteLogisticsModifiedAt`、`logisticsSnapshotJson`、`logisticsSnapshotAt`。
- 采购确认时按需求单取远端机房/收货地址/收件人快照写入物流行。
- `synchronizePendingRemoteLogistics()`（补齐待补全物流）与 `refreshShipmentRemoteLogistics()`（重新拉取远端物流）两条流程已接通，且已按「远端有值才覆盖 + 逐字段 diff 提示」实现。
- `src/lib/remote-shipment-timeline.ts` 已预留：
  - `REMOTE_SHIPMENT_TIMELINE_FIELDS`（远端字段 → 本地列，**当前为空**）
  - `SHIPMENT_TIMELINE_COLUMNS`（本地 8 个时间/运输方式列）
  - `loadRemoteShipmentTimelines()`（**当前恒返回空 Map**）

### 3.2 缺口（本方案要补的）

| 缺口 | 现状 |
| --- | --- |
| 没有 Release 级实体 | 无 `merge_power_shipmentreleases` 表，`merge_power_shipments` 无 `releaseId` 列 |
| 明细行没有远端身份 | `merge_power_requestitems` 列只有 `internalId/id/requestNo/deviceCode/requestType/supplierId/undertakingUnitId/customerId/requestedAt/quantity`，**没有 DOI，也没有物料编码** |
| DOI 与本地明细的映射断了 | `merge_power_demand_sync_items` 277 行，状态 `skipped_existing` 247 + `cancelled` 30，**`localRequestItemId` 全部为空** |
| 时间节点未接通 | `loadRemoteShipmentTimelines()` 空实现 |

第 3 条是必须先解决的前提：历史上这些需求单已经拉过（`skipped_existing` = 本地需求单已存在、未覆盖），所以同步时没有写明细级映射；现在既无法从台账拿 DOI，也无法从本地明细反推。

## 4. 核心结论：时间属于 Release 级

**时间节点不能按需求单号写，也不能独立存在本地明细行上，必须存在 Release（物流单）级。**

理由：

1. 20/154 的需求单有多条明细，7/154 跨多个 Release，3/154 的两条明细属于**不同 Shipment、时间不同**（2.3 节）。
2. 若按需求单号写时间，会把 SHP-00021 的 `signed_date = 2026-03-02` 套到属于 EDI-00057/58/59 的明细行上。
3. 单个 Release 最多覆盖 40 条明细，同一批货时间天然相同；把时间冗余到 40 行明细上只会产生不一致风险。

**回答「同个需求单号会有多条明细怎么处理」：**

- 不按需求单号落时间，按「明细行 → DOI → Release」落。
- 本地明细行挂 `releaseId`，时间从 Release 读；列表默认按 Release 聚合，一行 = 一个物流单。
- 对 134/154 只有一条明细的需求单，效果与一对一相同，看不出差别；对剩下 20 张，只有按 Release 拆才正确。

## 5. 数据模型

### 5.1 新增 `merge_power_shipmentreleases`（一行 = 一个 Release）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `releaseId` | VARCHAR(64) PK | 远端 Release ID，即物流单号 |
| `remoteShipmentNo` | VARCHAR(64) NULL | 远端 `SHP-xxxxx` |
| `remoteEdiOrderId` | VARCHAR(64) NULL | `EDI-xxxxx` |
| `remoteDemandOrderId` | VARCHAR(64) NULL | `DO-xxxxx` |
| `remoteCustomerPoNo` | VARCHAR(128) NULL | `customer_po_no` |
| `remoteSupplierId` | VARCHAR(64) NULL | 远端供应商 |
| `transportMode` | VARCHAR(64) NULL | 来自 `Demand Order.transport_mode` |
| `actualReadyAt` / `actualShippedAt` / `freightBookedAt` | DATETIME NULL | 实际节点 |
| `estimatedDepartedAt` / `actualDepartedAt` | DATETIME NULL | 起飞/开船 |
| `estimatedArrivedAt` / `actualArrivedAt` | DATETIME NULL | 到港 |
| `customsClearedDate` / `signedDate` | DATE NULL | 清关、签收 |
| `estimatedReadyDate` / `estimatedShipDate` / `estimatedDeliveryDate` | DATE NULL | 来自 EDI Order |
| `supplierPoActivatedAt` | DATETIME NULL | 来自 EDI Order |
| `waybillNo` / `masterBillNo` / `carrierCode` / `transportIdentifier` | VARCHAR NULL | 运单信息 |
| `inlandCarrier` / `internationalCarrier` / `incoterm` | VARCHAR NULL | 承运与条款 |
| `originPortCode` / `destinationPortCode` / `trackingRemarks` | VARCHAR / TEXT NULL | 港口与轨迹 |
| `remoteJson` | LONGTEXT NULL | 原始报文快照 |
| `remoteModifiedAt` | DATETIME NULL | 远端最后更新时间 |
| `lastSyncedAt` | DATETIME NULL | 本地拉取时间 |
| `syncStatus` | VARCHAR(32) | `synced` / `pending_shipment` / `failed` |
| `syncError` | VARCHAR(500) NULL | 失败原因 |
| `createdAt` / `updatedAt` | DATETIME | 审计 |

索引：`UNIQUE(remoteShipmentNo)`、`KEY(remoteDemandOrderId)`、`KEY(remoteCustomerPoNo)`、`KEY(syncStatus)`。

### 5.2 `merge_power_shipments` 增加

| 字段 | 说明 |
| --- | --- |
| `releaseId` VARCHAR(64) NULL | 关联物流单，加索引。同一 Release 的多行取值相同 |
| `remoteShipmentNo` VARCHAR(64) NULL | 冗余展示用，避免列表 JOIN |

release 级时间**不冗余到明细行**，列表通过 JOIN 展示，避免 N 行不一致。

### 5.3 `merge_power_requestitems` 增加（关键前提）

| 字段 | 说明 |
| --- | --- |
| `remoteDemandOrderItemId` VARCHAR(64) NULL | 远端 `DOI-xxxxx`，加索引 |
| `remoteReleaseId` VARCHAR(64) NULL | 冗余，加速采购确认时的归集 |

## 6. 字段映射表（即 `REMOTE_SHIPMENT_TIMELINE_FIELDS` 的填写内容）

### 6.1 建议映射（**待业务确认**）

| 远端字段 | 含义 | 本地列 | 建议 |
| --- | --- | --- | --- |
| `actual_ready_at` | 实际备货完成 | `crd` | CRD = 备货完成日 |
| `supplier_po_activated_at`（EDI Order） | 供应商 PO 激活 | `apdAt` | APD 交单 |
| `actual_shipped_at` | 实际发货 | `pickupAt` | ASD 提货 |
| `actual_departed_at` | 实际起飞/开船 | `departedAt` | 同名语义 |
| `actual_arrived_at` | 实际到港 | `arrivedAt` | 同名语义 |
| `customs_cleared_date` | 清关完成 | `customsClearedAt` | 同名语义 |
| `signed_date` | 签收 | `deliveredAt` | 同名语义 |
| `Demand Order.transport_mode` | 运输方式（Air/Sea） | `transportMode` | 映射为「空运/海运」 |

需要业务确认的两项：

1. 本地 `apdAt`「APD 交单」对应远端 `supplier_po_activated_at` 还是 `actual_ready_at`？
2. 本地 `pickupAt`「ASD 提货」对应远端 `actual_shipped_at` 还是 `actual_ready_at`？

确认前 `REMOTE_SHIPMENT_TIMELINE_FIELDS` 保持为空，接口照常返回「没有远端时间节点」。

### 6.2 附加字段（只读展示，不影响现有口径）

`estimated_departed_at`、`estimated_arrived_at`、`estimated_ready_date`、`estimated_ship_date`、`estimated_delivery_date`、`waybill_no`、`master_bill_no`、`carrier_code`、`transport_identifier`、`freight_booked_at`。

### 6.3 口径

- 远端有值才写，本地已有值且远端为空时保留本地值（沿用现有 `applyRemoteLogisticsFields` 逻辑）。
- 远端有值且与本地不同时，覆盖并生成 diff 提示（沿用 `describeRemoteChanges`）。
- 远端值为 `null` 时 Frappe **不返回该字段**，解析必须按「字段可缺失」处理。

## 7. 关联与同步算法

### 7.1 补齐 DOI 与本地明细的映射（一次性回填）

按优先级：

1. **台账命中**：`merge_power_demand_sync_items.localRequestItemId` 直接回填。（当前全空，基本用不上）
2. **规则匹配**：同一 `requestNo` 内，

   ```text
   远端 DOI.material → merge_power_demand_sync_mappings(sourceType='material', sourceId=MAT-xxxxx).localEntityId
                    → 本地 instancemodels.deviceCode
   匹配键 = (deviceCode, quantity)
   ```

   唯一命中即回填；零命中或多命中进入人工确认清单，复用现有「同步映射」页面，**禁止静默猜测**。
3. 需求单同步流程补一步：新建需求行时把 `sourceItem.id`（DOI）写入 `requestitems.remoteDemandOrderItemId`；`skipped_existing` 分支也要补一次明细级匹配，避免以后再出现断链。

### 7.2 时间同步（把 `loadRemoteShipmentTimelines` 落地）

现有签名 `loadRemoteShipmentTimelines(requestNos: string[]) → Map<requestNo, Row>` 本身就假设「一个需求单一份时间」，与本方案冲突，必须改为按 Release：

```text
loadRemoteShipmentTimelines(releaseIds: string[]) → Map<releaseId, Row>
```

同步流程：

```text
1. 从 shipments / requestitems 收集需要同步的明细行与其 releaseId
2. releaseId 为空的行 → 走 7.1 的 DOI 回填
3. GET /api/resource/SL%20Shipment?filters=[["edi_order","in",[...EDI]]]   ← 一次批量
   GET /api/resource/EDI%20Order/<name>                                     ← 逐单据取子表 DOI 归属
4. UPSERT merge_power_shipmentreleases（按 releaseId）
5. 按 releaseId 把时间写入本地物流行（远端有值才写），并生成 diff 提示
```

### 7.3 触发时机

| 场景 | 触发 |
| --- | --- |
| 采购确认生成物流行 | 同步拉取该 PO 涉及的全部 Release 时间 |
| 「补齐待补全物流」 | 按 pending 行的 Release 批量补 |
| 「重新拉取远端物流」 | 按 Release 全量刷新，不按单行局部刷新 |
| Release 尚无 Shipment（40 个） | `syncStatus = pending_shipment`，时间留空，可重试 |
| 远端在本地确认之后才生成 Shipment | 同上，支持补拉 |

## 8. 界面改动

物流列表新增列（默认可见）：`releaseId`（远程物流单号）、`remoteShipmentNo`（远端 SHP 单号）、`actualReadyAt`、`signedDate`、`waybillNo`。

新增筛选：「远程物流单号」「是否已生成远端物流单」。

展示规则：命中远端 Release 的行显示远端值；未命中显示 `—`，不影响本地手工/导入的值。

## 9. 迁移、兼容与回滚

- 结构变更走 `scripts/migrate.ts` 的幂等 `createTableIfNotExists` / `addColumnIfMissing`，同步更新 `schema.sql`。
- 存量 283 行 `releaseId` 为空，列表与导出必须容忍空值。
- `shipments.shipmentId` 主键与生成规则不变（`SHP-{poNo}-{3位序号}`），不影响既有导出与结差。
- 回滚：删除新增表/列即可，不动任何存量列。

## 10. 风险与边界

| 风险 | 处理 |
| --- | --- |
| DOI 与本地明细映射全空 | 先做 7.1 回填 + 歧义清单，不回填完不上线时间同步 |
| 40 个 Release 尚无 Shipment | `pending_shipment` + 可重试 |
| 一个 Release 被多张本地 PO 引用 | 按 `releaseId` 全量刷新，不按 PO 局部刷 |
| 本地 PO 跨多个需求单 | 按明细行逐行解析 DOI，天然支持多 Release |
| 远端时间无时区标记 | 统一按 `Asia/Shanghai` 解析，列表取日期部分 |
| 逐单据读 EDI Order（163 次请求） | 增量按 `modified` 过滤 + 并发限流 |
| 远端列与本地手工列并存 | 远端列只读；时间列远端有值才覆盖 |
| `cancelled` 明细（30 行） | 不参与 Release 归集，保持现有取消逻辑 |

## 11. 实施步骤

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 结构迁移：`shipmentreleases`、`shipments.releaseId`、`requestitems.remoteDemandOrderItemId` | 1 天 |
| 2 | DOI 回填脚本 + 歧义清单（复用同步映射页面） | 1～1.5 天 |
| 3 | 远端读取服务：EDI 子表 + SL Shipment 拉取、缺失字段解析、限流与错误归类 | 1～2 天 |
| 4 | 时间映射表落地 + `loadRemoteShipmentTimelines` 改为按 Release | 1 天 |
| 5 | 采购确认 / 补齐 / 重新拉取三条流程接入 + diff 提示 | 1～1.5 天 |
| 6 | 列表列与筛选、导出 | 1 天 |
| 7 | 测试（单元 + 真实数据抽样）、`npm test`、`npm run build` | 1 天 |

## 12. 需要业务/远端确认的事项

1. `apdAt`（APD 交单）与 `pickupAt`（ASD 提货）分别对应哪个远端字段？（6.1 节）
2. 运输方式 `Air`/`Sea` 是否统一显示为「空运/海运」，还是有其他取值？
3. 远端是否有 Release 到序列号（SN）级的明细？（若无，本地只能靠 DOI 定位到明细行）
4. 是否开放 `EDI Order Item` 列表接口权限（否则只能逐单据读取，全量 163 次请求）。
