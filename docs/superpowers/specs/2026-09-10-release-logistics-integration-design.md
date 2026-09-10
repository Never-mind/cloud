# 远程物流单（Release ID）接入开发方案

编写日期：2026-09-10
涉及远端：`http://192.168.2.27:1337`（Frappe）
涉及本地：`merge_power_shipments`、`merge_power_requestitems`、采购确认流程

## 1. 目标

1. 本地物流列表以远端 **Release ID**（如 `2429742620847112194`）作为物流单号主体，与远端 `SL Shipment`（`SHP-xxxxx`）一一对应。
2. 从远端 `SL Shipment` 拉取 `actual_ready_at`、`signed_date`、`actual_shipped_at`、`actual_departed_at`、`actual_arrived_at`、`customs_cleared_date` 等时间，写回本地物流列表用于后续时间更新。
3. 明确「一个 Release 覆盖多个实例型号」时的数据归属与列表呈现方式。

## 2. 远端数据实测结论（2026-09-10）

### 2.1 当前 Token 的可访问范围

可读 Doctype：`Demand Order`、`Demand Order Item`、`EDI Order`、`SL Shipment`、`Business Partner`、`Material`、`Datacenter`、`Delivery Location`、`Delivery Recipient List`。

受限（403）：所有子表 Doctype 的列表接口（`EDI Order Item`、`SL Shipment Item`、`Serial No`、`Purchase Order` 等），以及 `DocType` 元数据接口。

**关键发现**：子表无法单独查询，但 `EDI Order` 的**单据接口**会内嵌返回子表：

```http
GET /api/resource/EDI%20Order/EDI-00043
Authorization: token <key>:<secret>
```

返回中包含 `edi_order_items: [{ demand_order_item: "DOI-00132", ... }]`。

而列表接口 `GET /api/resource/EDI%20Order?fields=["*"]` **不会**返回子表。
→ 结论：Release → 实例型号的归属必须逐单据读取（当前 163 个 EDI Order）。

### 2.2 关系模型

```text
Demand Order (DO-xxxxx, customer_po_no)
  └─ 1:N Demand Order Item (DOI-xxxxx, material / supplier / customer_batch_no / quantity / status)
        └─ N:1 EDI Order Item (子表 demand_order_item)
              └─ EDI Order (EDI-xxxxx, release_id)        ← 远端物流单号（Release ID）
                    └─ 0..1 SL Shipment (SHP-xxxxx)        ← 时间、运单、承运信息
```

### 2.3 实测统计

| 项目 | 实测值 |
| --- | --- |
| EDI Order 总数 | 163 |
| 不同 `release_id` 数 | 163（与 EDI Order 严格 1:1，无重复） |
| SL Shipment 总数 | 123 |
| 有 EDI Order 但尚无 SL Shipment | 40 |
| EDI Order Item（子表）行数 | 277 |
| DOI → Release 归属唯一性 | 277/277 均只属于 1 个 Release，**0 冲突** |
| 有明细的 Demand Order | 154 个，其中 7 个跨多个 Release（最多 4 个） |
| 单个 Release 覆盖行数 | 最多 40 行（40 个不同物料） |
| EDI Order → SL Shipment | 0..1，不存在一对多 |
| SL Shipment 子表 | 无，不提供逐序列号 / 逐实例明细 |

单 Release 覆盖行数分布：`1 行 ×141、2 行 ×7、3 行 ×3、4 行 ×2、5 行 ×5、8 行 ×2、9 行 ×1、15 行 ×1、40 行 ×1`。

### 2.4 用户示例对应的真实数据（DO-00049）

`customer_po_no = eSHWC251217d81j`，共 7 行明细，分属 4 个 Release：

| Release ID | EDI Order | 覆盖的 DOI（实例型号） |
| --- | --- | --- |
| 2429742620847112194 | EDI-00043 | DOI-00127、DOI-00129、DOI-00131、DOI-00132（4 个） |
| 2549108128588234769 | EDI-00057 | DOI-00133 |
| 2549077282133114885 | EDI-00058 | DOI-00130（Cancelled） |
| 2542407112021508100 | EDI-00059 | DOI-00128 |

对应远端物流单：`SHP-00021`（挂在 EDI-00043 上），其 `signed_date = 2026-03-02`、`actual_ready_at = 2026-01-14 20:06:08`。

### 2.5 EDI Order 可用字段

`name`、`release_id`、`demand_order`、`supplier`、`generated_at`、`note`、`estimated_ready_date`、`estimated_ship_date`、`estimated_delivery_date`、`supplier_po_activated_at`、`serials_first_received_at`，以及子表 `edi_order_items[].demand_order_item`。

### 2.6 SL Shipment 可用字段

`name`、`edi_order`、`actual_ready_at`、`actual_shipped_at`、`freight_booked_at`、`estimated_departed_at`、`actual_departed_at`、`estimated_arrived_at`、`actual_arrived_at`、`customs_cleared_date`、`signed_date`、`master_bill_no`、`waybill_no`、`carrier_code`、`transport_identifier`、`inland_carrier`、`international_carrier`、`incoterm`、`origin_port_code`、`destination_port_code`、`tracking_remarks`。

注意：Frappe 不会返回值为 `null` 的字段，解析时需按「字段可缺失」处理。

## 3. 本地现状

### 3.1 物流表

`merge_power_shipments` 当前 **282 行，全部为 `remoteLogisticsSourceStatus = 'legacy'`**，`remoteDemandOrderId` 全为空（上一版新增的远端快照能力尚未在真实数据上跑过）。

`shipmentId` 生成规则（`src/lib/procurement-workflow.ts` 的 `buildShipmentDraft`）：

```text
SHP-{poNo}-{3 位序号}      例：SHP-PO20260625-001
```

即**一个采购明细行 = 一条物流记录**，一条 PO 可以有多条（最多实测 11 条）。

时间列：`crd`、`apdAt`、`pickupAt`、`departedAt`、`arrivedAt`、`customsClearedAt`、`deliveredAt`。
签收规则（`src/lib/crud.ts`）：`deliveredAt` 非空 = 已签收，空 = 未签收。

### 3.2 需求行与远端行的关联缺口

- `merge_power_requestitems` **没有**远端 DOI 字段。
- 需求同步台账 `merge_power_demand_sync_items` 保存了 `sourceItemId`(DOI) ↔ `localRequestItemId`，当前 96 行、覆盖率 100%（对应本地 `F-DOI-xxxxx` 行）。
- 历史导入的本地行（`RI-xxxxx` 命名）**没有** DOI 映射，例如 `eSHWC251217d81j` 的 6 行 `RI-...` 全部缺失。
- 本地 121 张已确认 PO 中，**45 张跨多个需求单**（`sourceRequestNos`），因此一次采购确认可能同时涉及多个 Release。

## 4. 两个核心问题的结论

### Q1：能用 Release ID 作为本地物流 ID 吗？

**能，但只能作为「物流单」的主键，不能作为「物流明细行」的主键。**

原因是 1 个 Release 最多覆盖 40 个实例型号（实测），而本地 `shipments` 是明细行表。
如果把 `releaseId` 直接当 `shipmentId`，同一 Release 的 N 行会主键冲突，必然要加后缀（`2429742620847112194-001`），既破坏「物流单号」语义，也让存量 282 行无法兼容。

→ 推荐：**新增 Release 级实体**，`releaseId` 作为其主键；`shipments` 明细行通过 `releaseId` 关联。

### Q2：一个 Release 多个实例型号怎么处理？

远端已经给出了**精确到行的归属**：`EDI Order.edi_order_items[].demand_order_item` 指向具体 DOI，且实测 277/277 无歧义（一个 DOI 只属于一个 Release）。

因此处理方式是：

1. 建立 **本地需求行 ↔ DOI** 的映射（关键前提，见 5.3）。
2. 采购确认时按 PO 明细行 → DOI → Release 归集。
3. 列表**默认按 Release 聚合**：一行 = 一个物流单（显示 Release ID、物流单号、实例型号数量、各时间）；需要时展开看明细行（实例编码、实例名称、数量）。

不需要按供应商/批次做模糊匹配，也不存在「无法判定归属」的情况——前提是第 1 步的映射先补齐。

## 5. 目标数据模型

### 5.1 新增 `merge_power_shipmentreleases`（物流单，一行 = 一个 Release）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `releaseId` | VARCHAR(64) PK | 远端 Release ID，即物流单号 |
| `remoteShipmentNo` | VARCHAR(64) NULL | 远端 SHP-xxxxx（未生成时为空） |
| `remoteEdiOrderId` | VARCHAR(64) NULL | EDI-xxxxx |
| `remoteDemandOrderId` | VARCHAR(64) NULL | DO-xxxxx |
| `remoteSupplierId` | VARCHAR(64) NULL | 远端供应商（BP-xxx） |
| `actualReadyAt` | DATETIME NULL | 实际备货完成 |
| `freightBookedAt` | DATETIME NULL | 订舱 |
| `actualShippedAt` | DATETIME NULL | 实际发货 |
| `estimatedDepartedAt` / `actualDepartedAt` | DATETIME NULL | 预计/实际起飞（开船） |
| `estimatedArrivedAt` / `actualArrivedAt` | DATETIME NULL | 预计/实际到港 |
| `customsClearedDate` | DATE NULL | 清关完成 |
| `signedDate` | DATE NULL | 签收 |
| `estimatedReadyDate` / `estimatedShipDate` / `estimatedDeliveryDate` | DATE NULL | 来自 EDI Order 的预计时间 |
| `supplierPoActivatedAt` | DATETIME NULL | 供应商 PO 激活 |
| `waybillNo` / `masterBillNo` / `carrierCode` / `transportIdentifier` | VARCHAR NULL | 运单、主单、承运商 |
| `inlandCarrier` / `internationalCarrier` / `incoterm` / `originPortCode` / `destinationPortCode` | VARCHAR NULL | 承运与贸易条款 |
| `trackingRemarks` | TEXT NULL | 轨迹备注 |
| `remoteJson` | LONGTEXT NULL | 原始报文快照 |
| `remoteModifiedAt` | DATETIME NULL | 远端最后更新时间 |
| `lastSyncedAt` | DATETIME NULL | 本地拉取时间 |
| `syncStatus` | VARCHAR(32) | `synced` / `pending_shipment` / `failed` |
| `syncError` | VARCHAR(500) NULL | 失败原因 |
| `createdAt` / `updatedAt` | DATETIME | 审计 |

索引：`UNIQUE(remoteShipmentNo)`、`KEY(remoteDemandOrderId)`、`KEY(syncStatus)`。

### 5.2 `merge_power_shipments` 增加关联列

| 字段 | 说明 |
| --- | --- |
| `releaseId` VARCHAR(64) NULL | 关联物流单；索引。同一 Release 的多行取值相同 |

**可选**：是否把 release 级时间冗余到明细行。
建议**不冗余**，列表通过 JOIN 展示；冗余会在 N 行间产生不一致风险。若为了兼容现有导出/筛选必须冗余，则统一用 `UPDATE ... WHERE releaseId = :releaseId` 全量刷新，禁止逐行写。

### 5.3 `merge_power_requestitems` 增加远端来源列（关键前提）

| 字段 | 说明 |
| --- | --- |
| `remoteDemandOrderItemId` VARCHAR(64) NULL | 远端 DOI-xxxxx |
| `remoteReleaseId` VARCHAR(64) NULL | 冗余，加速采购确认时的归集（可选） |

回填策略（按优先级）：

1. 台账命中：`merge_power_demand_sync_items.localRequestItemId → sourceItemId`，当前 96 行可直接回填。
2. 规则匹配：对未命中的历史行（`RI-xxxxx`），在同 `requestNo` 内按 `material ↔ deviceCode 映射 + supplierId + quantity + customer_batch_no` 与远端 DOI 做匹配。
3. 歧义行（同物料多行且数量相同）进入人工确认清单，复用现有「同步映射」页面处理，不静默猜测。

### 5.4 远端字段 → 本地列映射

| 远端字段 | 含义 | 本地目标 |
| --- | --- | --- |
| `release_id` | Release ID | `shipmentreleases.releaseId` |
| `SL Shipment.name` | 远端物流单号 | `remoteShipmentNo` |
| `EDI Order.name` | EDI 单号 | `remoteEdiOrderId` |
| `EDI Order.demand_order` | 需求单 | `remoteDemandOrderId` |
| `actual_ready_at` | 实际备货完成 | `actualReadyAt` |
| `freight_booked_at` | 订舱 | `freightBookedAt` |
| `actual_shipped_at` | 实际发货 | `actualShippedAt` |
| `actual_departed_at` / `estimated_departed_at` | 实际/预计起飞（开船） | `actualDepartedAt` / `estimatedDepartedAt` |
| `actual_arrived_at` / `estimated_arrived_at` | 实际/预计到港 | `actualArrivedAt` / `estimatedArrivedAt` |
| `customs_cleared_date` | 清关完成 | `customsClearedDate` |
| `signed_date` | 签收 | `signedDate`（同时驱动「是否签收」） |
| `waybill_no` / `master_bill_no` / `carrier_code` / `transport_identifier` | 运单信息 | 同名列为 `waybillNo` 等 |
| `EDI Order.estimated_ready_date` / `estimated_ship_date` / `estimated_delivery_date` | 预计时间 | 同名列为 `estimatedReadyDate` 等 |
| `EDI Order.supplier_po_activated_at` | 供应商 PO 激活 | `supplierPoActivatedAt` |

存量本地时间列（`crd`/`apdAt`/`pickupAt`/`departedAt`/`arrivedAt`/`customsClearedAt`/`deliveredAt`）目前是业务手工维护/历史导入，**建议保持不动**，新增只读的远端列并列展示，等业务确认口径后再决定是否由远端回填。

待业务确认的语义对应（当前无法从远端字段名唯一确定）：

- 本地 `apdAt`「APD 交单」↔ 远端 `supplier_po_activated_at` 还是 `actual_ready_at`？
- 本地 `pickupAt`「ASD 提货」↔ 远端 `actual_shipped_at`？
- 本地 `deliveredAt`「派送」↔ 远端 `signed_date`？

## 6. 关联与同步算法

### 6.1 需求同步阶段（已有流程，补一步）

`runFrappeDemandSync` 创建需求行时，除台账外，把 `sourceItem.id`（DOI）写入 `requestitems.remoteDemandOrderItemId`。

### 6.2 采购确认阶段（新增）

对一张 PO：

1. 取该 PO 全部明细行，解析每行的 `requestNo` 与 `remoteDemandOrderItemId`。
2. 缺少 DOI 的行 → 走 5.3 的回填/匹配；仍无法确定则该行 `releaseId` 留空并给出明细提示（不阻断整单确认，但要在返回值里体现）。
3. 按 `requestNo` 汇总远端查询：
   - `GET /api/resource/EDI%20Order?filters=[["demand_order","in",[...DO]]]` 取 EDI 单与 Release；
   - 对命中的 EDI 单逐条 `GET /api/resource/EDI%20Order/<name>` 取 `edi_order_items`，建立 `DOI → releaseId`；
   - `GET /api/resource/SL%20Shipment?filters=[["edi_order","in",[...EDI]]]` 取时间与运单信息。
4. UPSERT `shipmentreleases`（按 `releaseId`）。
5. `UPDATE shipments SET releaseId = :releaseId WHERE purchaseOrderItemId = :itemId`。

伪代码：

```text
lines        = PO 明细行[]
doiByLine    = lines.map(l => resolveDoi(l))            // requestitems.remoteDemandOrderItemId
doiToRelease = fetchReleaseByDoi(doiByLine.values)      // EDI Order 单据接口，内嵌子表
releases     = fetchShipmentsByRelease(...)             // SL Shipment
upsertShipmentReleases(releases)
for (line of lines) update shipment set releaseId = doiToRelease[doiByLine[line]]
```

### 6.3 重新拉取

现有 `POST /api/shipments/[shipmentId]/remote-logistics` 按「一条明细行」刷新，语义不匹配 Release 级数据。
→ 新增/改造成按 Release 刷新：`POST /api/shipment-releases/[releaseId]/remote-logistics`，一次刷新该 Release 全部明细行的关联展示。

### 6.4 定时补偿

实测 40 个 EDI Order 尚无 SL Shipment，Release 也可能在本地采购确认**之后**才生成。
→ `syncStatus = pending_shipment` 的 Release 需要可重试（手动按钮 + 可选定时任务，参照现有 `sync:frappe-demands` 的脚本模式）。

## 7. 界面改动

物流列表（`entityConfigs.shipments`）新增列：

`releaseId`（远程物流单号，默认可见）、`remoteShipmentNo`（远端 SHP 单号）、`waybillNo`（运单号）、`masterBillNo`（主单号）、`carrierCode`（承运商）、`actualReadyAt`（实际备货完成）、`signedDate`（签收日期），其余字段默认隐藏。

筛选项：新增「远程物流单号」「是否已生成远端物流单」；保留现有国家/运输方式/签收状态筛选。

签收状态口径：保留 `deliveredAt` 的现有规则；如需以远端为准，另加「远端签收」筛选项，不直接改写现有口径。

## 8. 迁移、兼容与回滚

- 结构变更走 `scripts/migrate.ts` 的幂等 `addColumnIfMissing` / `createTableIfNotExists` 模式，并同步更新 `schema.sql`。
- 存量 282 行 `releaseId` 为空，列表与导出必须容忍空值（显示「—」），不做强制非空。
- 现有 `shipmentId` 主键与生成规则**不变**，避免影响 PO → 物流的既有引用、导出与结差流程。
- 回滚脚本：删除新增列/表即可，不改动任何存量列。

## 9. 风险与边界

| 风险 | 处理 |
| --- | --- |
| Release 尚无 SL Shipment（40/163） | 允许先落 Release，时间留空，`syncStatus = pending_shipment`，可重试 |
| 远端 Release 在本地确认之后才生成 | 同上，支持补拉 |
| 同一 Release 被多张本地 PO 引用（PO 拆分） | 更新一律按 `releaseId` 全量刷新，不按 PO 局部刷新 |
| 本地 PO 跨多个需求单（45 张） | 归集按明细行逐行解析 DOI，天然支持多 Release |
| 历史行无 DOI 映射 | 先台账回填、再规则匹配、歧义人工确认，禁止静默猜测 |
| 远端时间无时区标记 | 统一按 `Asia/Shanghai` 解析；列表按日期展示时取日期部分 |
| 逐单据读取 EDI Order（163 次请求） | 增量按 `modified` 过滤 + 并发限流；需远端确认是否支持 |
| 远端列与本地手工列并存 | 远端列只读，避免覆盖业务数据 |

## 10. 需要远端配合确认的事项

1. 开放 `EDI Order Item` 列表接口权限（否则只能逐单据读取，163 次/全量）。
2. 确认是否存在 Release → 序列号（SN）级明细；若无，本地实例明细只能靠 DOI。
3. 明确 APD / ASD 对应的远端字段口径。
4. 确认增量拉取方式（`modified` 过滤、分页上限）。

## 11. 实施步骤

| 步骤 | 内容 | 预估 |
| --- | --- | --- |
| 1 | 结构迁移：新增 `shipmentreleases` 表，`shipments.releaseId`，`requestitems.remoteDemandOrderItemId`；台账回填 | 1 天 |
| 2 | 远端读取服务：Release/EDI 子表/SL Shipment 拉取与解析（含缺失字段、限流、错误归类） | 1–2 天 |
| 3 | 采购确认接入：按明细行归集 Release 并落库；失败不阻断确认但返回明细提示 | 1 天 |
| 4 | 列表与刷新接口：新增列、筛选、按 Release 重新拉取 | 1–2 天 |
| 5 | 历史回填脚本 + 歧义清单（复用同步映射页面） | 1 天 |
| 6 | 测试（单元 + 真实数据抽样）、`npm test`、`npm run build` 验收 | 1 天 |

## 附录：验证用接口样例

```bash
# 需求单 → EDI 单（含 Release ID）
GET /api/resource/EDI%20Order?fields=["name","release_id","demand_order"]&filters=[["demand_order","=","DO-00049"]]

# EDI 单 → 子表 DOI 归属（列表接口不返回，必须用单据接口）
GET /api/resource/EDI%20Order/EDI-00043

# EDI 单 → 物流单时间与运单
GET /api/resource/SL%20Shipment?fields=["name","edi_order","actual_ready_at","signed_date","waybill_no"]
```

认证头：`Authorization: token <api_key>:<api_secret>`（复用 `MATERIAL_API_TOKEN` / `FRAPPE_DEMAND_API_TOKEN`）。
