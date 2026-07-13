# cloud_power 算力交付管理系统技术文档

## 1. 系统用途

本系统用于管理算力交付业务中的基础资料、客户需求、采购下单、物流交付、实例合同、月账单核销、预付款核销、服务费核算、对账单导出和数据初始化导入。

系统围绕以下业务链路设计：

`需求单 -> 采购订单 -> 物流 -> 月账单 / 预付款 -> 服务费核算 -> 对账与快照`

核心目标是减少手工维护，支持主从单据、明细一览、批量导入、自动补全、状态流转、财务核销、调整单、快照留存和 Excel 导入导出。

## 2. 技术栈

| 类型 | 技术 |
| --- | --- |
| 前端框架 | Next.js App Router、React |
| 样式 | Tailwind CSS、自定义组件 |
| 图标 | lucide-react |
| 数据库 | MySQL |
| 数据库驱动 | mysql2 |
| Excel 导入 | xlsx |
| Excel 格式化导出 | exceljs |
| 测试 | Vitest、Testing Library |
| 运行环境 | Node.js、npm |

## 3. 启动方式

1. 安装依赖：

```bash
npm install
```

2. 配置 `.env.local`：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=suanli
DB_CONNECTION_LIMIT=5
```

3. 初始化或迁移数据库：

```bash
npm run migrate
```

4. 如需填充测试数据：

```bash
npm run seed
```

5. 构建并启动：

```bash
npm run build
npm run start
```

6. 访问地址：

```text
http://127.0.0.1:3000/
```

开发热更新可使用：

```bash
npm run dev:hot
```

## 4. 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务 |
| `npm run dev` | 构建后启动 |
| `npm run dev:hot` | 开发热更新 |
| `npm run migrate` | 执行数据库迁移 |
| `npm run seed` | 迁移并写入测试数据 |
| `npm test` | 运行全部测试 |

## 5. 主要功能模块

| 一级模块 | 功能 |
| --- | --- |
| 首页 | 每月服务费图表、国家/月度新增实例数量、模块入口 |
| 基础信息 | 国家、交付地址、收件人、机房、供应商、实例型号 |
| 合同管理 | 实例合同、实例合同调整单 |
| 客户需求 | 需求单、需求明细一览 |
| 采购管理 | 采购订单、采购明细一览 |
| 物流管理 | 物流列表、字段显示/隐藏、导入更新 |
| 财务管理 - 月账单 | 待生成月账单实例、月账单台账、每月核销明细、月账单对账单 |
| 财务管理 - 预付款 | 待生成预付款实例、预付款合同、每月核销明细、核销调整单 |
| 财务管理 - 服务费 | 服务费核算、服务费快照、快照明细 |
| 数据工具 | 数据导入中心 |
| 文档管理 | 文件夹、文件上传、合同/发票等资料管理 |

## 6. 数据导入中心

入口：`/data-imports`

数据导入中心统一管理模板下载、文件上传、导入预览、错误报告、确认导入和导入历史。

当前支持：

| 导入类型 | 规则 |
| --- | --- |
| 需求单主从导入 | 按需求单号分组生成需求主单和需求明细 |
| 采购订单主从导入 | 支持系统采购ID为空自动生成；支持用需求单号 + 产品编码匹配需求明细 |
| 实例合同导入 | 按合同号、国家、设备编码生成合同记录 |
| 月账单台账初始化导入 | 台账ID可为空自动生成；采购明细ID可为空，按需求单号 + PO单号 + 实例编码自动匹配采购明细，并带出数量、币种、单价等信息 |
| 预付款合同初始化导入 | 导入后统一生成草稿；采购明细ID可为空，按需求单号 + PO单号 + 实例编码自动匹配采购明细，并带出国家、批次、机型、英文名称、数量、实际币种、实际单价、实际总价等信息 |

导入历史支持分页、每页条数选择、页码跳转和错误报告下载。

## 7. 数据库说明

数据库默认名称：`suanli`。

建表脚本：`schema.sql`。

迁移脚本：`scripts/migrate.ts`。

当前设计主要依赖索引和应用层逻辑约束，不使用数据库外键强约束。

### 7.1 基础信息表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `Countries` | `code` | `nameZh`, `nameEn`, `nameLocal` |
| `DeliveryLocations` | `locationId` | `countryCode`, `locationType`, `nameZh`, `nameEn`, `fullAddress` |
| `DeliveryContacts` | `contactId` | `locationId`, `name`, `phone`, `email` |
| `Datacenters` | `dcCode` | `locationId`, `nameZh`, `nameEn` |
| `InstanceModels` | `deviceCode` | `modelCode`, `xxllCode`, `nameZh`, `nameEn` |
| `Suppliers` | `supplierId` | `supplierCode`, `name` |

### 7.2 合同、需求、采购表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `InstanceContracts` | `id` | `contractNo`, `countryCode`, `deviceCode`, `modelCode`, `instanceModelEn`, `currency`, `first24MonthPriceUSD`, `next36MonthPriceUSD`, `dateSigned`, `status` |
| `Requests` | `requestNo` | `countryCode`, `contractNo`, `batchName`, `requestType`, `status`, `plannedDeliveryDate` |
| `RequestItems` | `id` | `requestNo`, `deviceCode`, `supplierId`, `requestedAt`, `quantity` |
| `PurchaseOrders` | `poNo` | `purchaseOrderId`, `requestNo`, `sourceRequestNos`, `status`, `currency`, `releasedAt` |
| `PurchaseOrderItems` | `id` | `purchaseOrderId`, `poNo`, `requestNo`, `requestItemId`, `unitPrice`, `hardwareCoefficient`, `softwareCoefficient`, `totalCoefficient` |

### 7.3 物流表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `Shipments` | `shipmentId` | `poNo`, `batchName`, `purchaseOrderItemId`, `deviceCode`, `nameEn`, `dcCode`, `dcNameZh`, `destinationLocationId`, `recipientContactId`, `snapshotDestinationAddress`, `snapshotRecipientName`, `snapshotRecipientPhone`, `transportMode`, `isReceived`, `crd`, `apdAt`, `pickupAt`, `departedAt`, `arrivedAt`, `customsClearedAt`, `deliveredAt` |

物流导入支持按物流ID更新已有记录。导入空白字段不会覆盖数据库已有值；目的地点ID、联系人ID、机房ID可自动带出地址快照、收件人快照和机房名称。

### 7.4 月账单表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `BillingInstanceLedgers` | `ledgerId` | `purchaseOrderItemId`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `actualCurrency`, `actualUnitPrice`, `instanceContractNo`, `contractCurrency`, `first24MonthPrice`, `next36MonthPrice`, `startMonth`, `status`, `confirmedAt` |
| `MonthlyBillingWriteOffs` | `id` | `ledgerId`, `writeOffMonth`, `monthIndex`, `stage`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `instanceContractNo`, `currency`, `monthlyAmount`, `monthlyTotalAmount`, `sourceType`, `adjustmentNo` |
| `BillingAdjustments` | `adjustmentNo` | `instanceContractNo`, `status`, `itemCount`, `countryCode`, `batchName`, `deviceCode`, `currency`, `effectiveMonth`, `adjustedFirst24MonthPrice`, `adjustedNext36MonthPrice`, `reason`, `confirmedAt` |
| `BillingStatementSnapshots` | `snapshotNo` | `countryCode`, `startDate`, `endDate`, `currencySummary`, `totalQuantity`, `totalAmount`, `itemCount`, `createdAt` |
| `BillingStatementSnapshotItems` | `id` | `snapshotNo`, `countryCode`, `currency`, `instanceContractNo`, `productType`, `unitPriceVatExcluded`, `vatRate`, `unitPriceVatIncluded`, `quantity`, `amount`, `startTime`, `endTime`, `sourceIds` |

### 7.5 预付款表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `PrepaymentContracts` | `contractNo` | `status`, `currency`, `effectiveDate`, `totalAmount`, `confirmedAt` |
| `PrepaymentContractItems` | `id` | `contractNo`, `lineType`, `purchaseOrderItemId`, `requestItemId`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `actualCurrency`, `actualUnitPrice`, `actualTotalAmount`, `contractCurrency`, `contractUnitPrice`, `contractTotalAmount`, `writeOffStartMonth`, `feeName`, `feeDescription` |
| `MonthlyPrepaymentWriteOffs` | `id` | `contractNo`, `contractLineId`, `writeOffMonth`, `monthIndex`, `totalMonths`, `currency`, `originalAmount`, `monthlyAmount`, `lineType`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `sourceType`, `adjustmentNo` |
| `PrepaymentWriteOffAdjustments` | `adjustmentNo` | `status`, `countryCode`, `batchName`, `contractNo`, `itemCount`, `differenceTotal`, `reason`, `confirmedAt` |

### 7.6 服务费和文档表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `ServiceFeeSnapshots` | `snapshotNo` | `status`, `startMonth`, `endMonth`, `countryCode`, `batchName`, `keyword`, `billingTotal`, `prepaymentTotal`, `serviceFeeTotal`, `confirmedAt` |
| `ServiceFeeSnapshotItems` | `id` | `snapshotNo`, `writeOffMonth`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `billingCurrency`, `prepaymentCurrency`, `billingAmount`, `prepaymentAmount`, `serviceFeeAmount` |
| `DocumentFolders` | `folderId` | `parentId`, `name`, `sortOrder`, `createdAt`, `updatedAt` |
| `DocumentFiles` | `fileId` | `folderId`, `originalName`, `storedName`, `filePath`, `mimeType`, `fileSize`, `createdAt` |
| `ImportJobs` | `jobId` | `targetKey`, `targetTitle`, `fileName`, `status`, `totalRows`, `successRows`, `failedRows`, `masterCount`, `detailCount`, `previewJson`, `reportJson` |

## 8. 页面路由

| 页面 | 说明 |
| --- | --- |
| `/` | 首页 |
| `/login` | 登录页 |
| `/master-data/countries` | 国家 |
| `/master-data/delivery-locations` | 交付地址 |
| `/master-data/delivery-contacts` | 收件人信息 |
| `/master-data/datacenters` | 机房 |
| `/master-data/suppliers` | 供应商 |
| `/master-data/instance-models` | 实例型号 |
| `/contracts/instance-contracts` | 实例合同 |
| `/finance/billing-adjustments` | 实例合同调整单 |
| `/requests/orders` | 需求单列表 |
| `/requests/orders/new` | 新建需求单 |
| `/requests/orders/[requestNo]` | 需求单详情 |
| `/requests/items` | 需求明细一览 |
| `/purchase/orders` | 采购订单列表 |
| `/purchase/orders/new` | 新建采购订单 |
| `/purchase/orders/[poNo]` | 采购订单详情 |
| `/purchase/items` | 采购明细一览 |
| `/shipments` | 物流列表 |
| `/finance/billing-available` | 待生成月账单实例 |
| `/finance/billing-ledgers` | 月账单台账 |
| `/finance/monthly-billing-writeoffs` | 月账单每月核销明细 |
| `/finance/billing-statements` | 月账单对账单 |
| `/finance/prepayment-available` | 待生成预付款实例 |
| `/finance/prepayment-contracts` | 预付款合同 |
| `/finance/prepayment-contracts/[contractNo]` | 预付款合同详情 |
| `/finance/monthly-prepayment-writeoffs` | 预付款每月核销明细 |
| `/finance/prepayment-writeoff-adjustments` | 预付款核销调整单 |
| `/finance/service-fees` | 服务费核算 |
| `/finance/service-fee-snapshots` | 服务费快照 |
| `/finance/service-fee-snapshot-items` | 服务费快照明细 |
| `/documents` | 文档管理 |
| `/data-imports` | 数据导入中心 |

## 9. API 接口

### 9.1 通用实体 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/entities/[entity]` | 查询实体列表，支持分页、搜索、筛选 |
| `POST` | `/api/entities/[entity]` | 新增实体 |
| `GET` | `/api/entities/[entity]/[id]` | 查询单条实体 |
| `PUT` | `/api/entities/[entity]/[id]` | 更新单条实体 |
| `DELETE` | `/api/entities/[entity]/[id]` | 删除单条实体 |
| `GET` | `/api/entities/[entity]/template` | 下载导入模板 |
| `POST` | `/api/entities/[entity]/import` | 批量导入 |
| `GET` | `/api/entities/[entity]/export` | 导出实体数据 |

### 9.2 数据导入中心 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/import-center` | 查询导入类型和导入历史，支持分页 |
| `GET` | `/api/import-center/template` | 下载指定类型模板 |
| `POST` | `/api/import-center/preview` | 上传文件并生成导入预览 |
| `POST` | `/api/import-center/confirm` | 确认写入预览数据 |
| `GET` | `/api/import-center/jobs/[jobId]/errors` | 下载错误报告 |

### 9.3 采购、月账单、预付款、服务费 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/procurement/from-request` | 根据需求单生成采购草稿 |
| `POST` | `/api/procurement/[poNo]/confirm` | 确认采购订单并生成物流 |
| `GET` | `/api/purchase/product-lines/export` | 导出采购明细一览 |
| `GET` | `/api/billing/available` | 查询待生成月账单实例 |
| `POST` | `/api/billing/confirm` | 生成月账单台账和60个月核销明细 |
| `GET` | `/api/billing/monthly-writeoffs` | 查询月账单每月核销明细 |
| `GET` | `/api/billing-statements` | 查询或预览月账单对账单 |
| `POST` | `/api/billing-statements` | 保存月账单对账单快照 |
| `GET` | `/api/billing-statements/[snapshotNo]/export` | 导出月账单对账单 Excel |
| `GET` | `/api/prepayments/available` | 查询待生成预付款实例 |
| `POST` | `/api/prepayments/drafts` | 勾选实例生成预付款合同草稿 |
| `PUT` | `/api/prepayments/contracts/[contractNo]` | 保存预付款合同草稿 |
| `POST` | `/api/prepayments/contracts/[contractNo]/confirm` | 确认合同并生成每月核销明细 |
| `GET` | `/api/prepayments/monthly-writeoffs` | 查询预付款每月核销明细 |
| `GET` | `/api/service-fees/calculate` | 实时计算服务费 |
| `POST` | `/api/service-fees/snapshots` | 保存服务费快照 |
| `GET` | `/api/dashboard/overview` | 首页统计数据 |

### 9.4 文档管理 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/documents/tree` | 查询文件夹树 |
| `GET` | `/api/documents/items` | 查询文件夹下内容 |
| `POST` | `/api/documents/folders` | 新建文件夹 |
| `PUT` | `/api/documents/folders/[folderId]` | 重命名文件夹 |
| `DELETE` | `/api/documents/folders/[folderId]` | 删除文件夹 |
| `POST` | `/api/documents/files/upload` | 批量上传文件 |
| `GET` | `/api/documents/files/[fileId]/download` | 下载文件 |
| `DELETE` | `/api/documents/files/[fileId]` | 删除文件 |

## 10. 核心业务规则

1. 基础信息不设置数据库外键强约束，数据一致性由应用层维护。
2. 需求单支持保存草稿和确认。确认后进入待下单状态，并可生成采购草稿。
3. 采购订单支持系统采购ID和用户填写的 PO 订单号；业务显示优先使用 PO 订单号。
4. 采购订单可合并多个需求单的明细，确认后需求单状态更新为已下单，并按采购明细生成物流记录。
5. 物流导入按物流ID更新已有记录，空白字段不覆盖已有数据。
6. 月账单台账生成后产生60个月核销明细：前24个月使用前24个月价格，后36个月使用后36个月价格。
7. 实例合同调整单优先级高于原实例合同；同一批次和实例存在多张调整单时，取最近确认的调整单。
8. 预付款合同导入或新建后先为草稿，确认合同后才生成24个月每月核销明细。
9. 预付款合同明细中的 `purchaseOrderItemId` 会占用对应实例，使其不再显示在待生成预付款实例中。
10. 服务费 = 月账单核销总额 - 预付款核销金额。
11. 服务费快照、服务费快照明细、月账单对账单快照保存后，不受后续源数据调整影响。
12. 月账单对账单按国家税率计算不含税单价：MX 16%，CL 19%，BR 2.9%。

## 11. 测试说明

测试文件主要位于 `src/lib/*.test.ts`。

重点覆盖：

- 需求、采购主从单据和状态流转
- 采购订单合并需求单
- 数据导入中心模板、预览、错误报告、确认导入
- 月账单60个月核销
- 实例合同调整单优先级
- 预付款合同、预付款核销调整单
- 服务费计算和快照
- 物流导入更新与空值保护
- 分页、跳转、导出、删除策略、内部标签页状态

运行：

```bash
npm test
```

## 12. 注意事项

1. 修改数据库字段时，需要同步更新 `schema.sql`、`scripts/migrate.ts`、`src/lib/modules.ts` 和相关 API/组件。
2. 服务端代码修改后，需要重新执行 `npm run build` 并重启 `npm run start` 才能在生产启动模式下生效。
3. 普通实体导入使用 `xlsx`；格式化 Excel 导出使用 `exceljs`。
4. 文档上传文件存储在服务器本地目录；远程部署时文件会保存在远程服务器对应目录。
5. 上传到 GitHub 前建议执行 `npm test` 和 `npm run build`。
