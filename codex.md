# cloud_power 算力交付管理系统技术文档

## 1. 系统用途

本系统用于管理算力交付业务中的基础资料、客户需求、采购下单、物流交付、实例合同、月账单核销、预付款核销、服务费核算及对账单导出等流程。

系统围绕“需求单 -> 采购订单 -> 物流 -> 月账单/预付款 -> 服务费核算”的业务链路设计，支持主从单据、明细一览、财务核销、调整单、快照留存、Excel 导入导出和内部多标签页工作台。

## 2. 主要功能

| 模块 | 功能 |
| --- | --- |
| 首页 | 国家维度服务费统计、新增实例数量统计、模块入口 |
| 基础信息 | 国家、交付地址、收件人、机房、供应商、实例型号维护 |
| 合同管理 | 实例合同、实例合同调整单维护 |
| 客户需求 | 需求单主从表、需求明细一览、草稿/确认/已下单流程 |
| 采购管理 | 采购订单主从表、采购明细一览、订单确认、自动生成物流 |
| 物流管理 | 物流列表、字段显示/隐藏配置、交付进度字段维护 |
| 月账单管理 | 待生成月账单实例、月账单台账、每月核销明细、月账单对账单快照与导出 |
| 预付款管理 | 待生成预付款实例、预付款合同、每月预付款核销明细、预付款核销调整单 |
| 服务费核算 | 月账单核销总额减预付款核销金额，生成服务费明细和服务费快照 |
| 系统交互 | 内部标签页工作台，打开模块后不关闭标签即可保留筛选、分页和输入状态 |

## 3. 技术栈

| 类型 | 技术 |
| --- | --- |
| 前端框架 | Next.js App Router、React |
| 样式 | Tailwind CSS、自定义 CSS 变量 |
| 图标 | lucide-react |
| 数据库 | MySQL |
| 数据库驱动 | mysql2 |
| Excel 导入 | xlsx |
| Excel 格式化导出 | exceljs |
| 测试 | Vitest、Testing Library |
| 运行环境 | Node.js、npm |

## 4. 项目结构

```text
src/app                       Next.js 页面和 API 路由
src/app/api                   后端 API
src/components                页面组件、业务组件、布局组件
src/lib                       业务逻辑、数据库访问、测试覆盖的纯函数
scripts/migrate.ts            数据库迁移脚本
scripts/seed.ts               测试数据脚本
schema.sql                    数据库建表脚本
```

## 5. 环境变量

参考 `.env.example`：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=suanli
DB_CONNECTION_LIMIT=5
```

## 6. 启动方式

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

3. 初始化/迁移数据库：

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

6. 本地访问：

```text
http://127.0.0.1:3000/
```

开发热更新可使用：

```bash
npm run dev:hot
```

## 7. 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run build` | 构建生产包 |
| `npm run start` | 启动生产服务 |
| `npm run dev` | 构建后启动 |
| `npm run dev:hot` | 开发热更新 |
| `npm run migrate` | 执行数据库迁移 |
| `npm run seed` | 迁移并写入测试数据 |
| `npm test` | 运行全部测试 |

## 8. 数据库说明

系统数据库名默认为 `suanli`。建表脚本位于 `schema.sql`。当前设计主要使用索引和应用层逻辑约束，不依赖数据库外键强约束。

### 8.1 基础信息表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `Countries` | `code` | `nameZh`, `nameEn`, `nameLocal` |
| `DeliveryLocations` | `locationId` | `countryCode`, `locationType`, `nameZh`, `nameEn`, `fullAddress` |
| `DeliveryContacts` | `contactId` | `locationId`, `name`, `phone`, `email` |
| `Datacenters` | `dcCode` | `locationId`, `nameZh`, `nameEn` |
| `InstanceModels` | `deviceCode` | `modelCode`, `xxllCode`, `nameZh`, `nameEn` |
| `Suppliers` | `supplierId` | `supplierCode`, `name` |

### 8.2 合同与需求采购表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `InstanceContracts` | `id` | `contractNo`, `countryCode`, `deviceCode`, `modelCode`, `instanceModelEn`, `currency`, `first24MonthPriceUSD`, `next36MonthPriceUSD`, `dateSigned`, `status`, `createdAt`, `updatedAt` |
| `ContractItems` | `id` | `contractNo`, `deviceCode`, `basePrice`, `currency` |
| `Requests` | `requestNo` | `countryCode`, `contractNo`, `batchName`, `requestType`, `status`, `plannedDeliveryDate`, `createdAt`, `updatedAt` |
| `RequestItems` | `id` | `requestNo`, `deviceCode`, `supplierId`, `requestedAt`, `quantity` |
| `PurchaseOrders` | `poNo` | `requestNo`, `status`, `currency`, `releasedAt`, `createdAt`, `updatedAt` |
| `PurchaseOrderItems` | `id` | `poNo`, `requestItemId`, `unitPrice`, `hardwareCoefficient`, `softwareCoefficient`, `totalCoefficient` |

### 8.3 物流表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `Shipments` | `shipmentId` | `poNo`, `purchaseOrderItemId`, `deviceCode`, `nameEn`, `destinationLocationId`, `recipientContactId`, `snapshotDestinationAddress`, `snapshotRecipientName`, `snapshotRecipientPhone`, `transportMode`, `isReceived`, `crd`, `apdAt`, `pickupAt`, `departedAt`, `arrivedAt`, `customsClearedAt`, `deliveredAt`, `createdAt`, `updatedAt` |

### 8.4 预付款表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `PrepaymentContracts` | `contractNo` | `status`, `currency`, `effectiveDate`, `totalAmount`, `confirmedAt`, `createdAt`, `updatedAt` |
| `PrepaymentContractItems` | `id` | `contractNo`, `lineType`, `purchaseOrderItemId`, `requestItemId`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `actualCurrency`, `actualUnitPrice`, `actualTotalAmount`, `contractCurrency`, `contractUnitPrice`, `contractTotalAmount`, `writeOffStartMonth`, `feeName`, `feeDescription` |
| `MonthlyPrepaymentWriteOffs` | `id` | `contractNo`, `contractLineId`, `writeOffMonth`, `monthIndex`, `totalMonths`, `currency`, `originalAmount`, `monthlyAmount`, `lineType`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `sourceType`, `adjustmentNo` |
| `PrepaymentWriteOffAdjustments` | `adjustmentNo` | `status`, `countryCode`, `batchName`, `contractNo`, `itemCount`, `differenceTotal`, `reason`, `confirmedAt`, `createdAt`, `updatedAt` |
| `PrepaymentWriteOffAdjustmentItems` | `id` | `adjustmentNo`, `monthlyWriteOffId`, `contractNo`, `contractLineId`, `writeOffMonth`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `currency`, `originalMonthlyAmount`, `adjustedMonthlyAmount`, `differenceAmount` |

### 8.5 月账单表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `BillingInstanceLedgers` | `ledgerId` | `purchaseOrderItemId`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `actualCurrency`, `actualUnitPrice`, `instanceContractNo`, `contractCurrency`, `first24MonthPrice`, `next36MonthPrice`, `startMonth`, `status`, `confirmedAt`, `createdAt`, `updatedAt` |
| `MonthlyBillingWriteOffs` | `id` | `ledgerId`, `writeOffMonth`, `monthIndex`, `stage`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `instanceContractNo`, `currency`, `monthlyAmount`, `monthlyTotalAmount`, `sourceType`, `adjustmentNo` |
| `BillingAdjustments` | `adjustmentNo` | `instanceContractNo`, `status`, `itemCount`, `countryCode`, `batchName`, `deviceCode`, `currency`, `effectiveMonth`, `adjustedFirst24MonthPrice`, `adjustedNext36MonthPrice`, `reason`, `confirmedAt`, `createdAt`, `updatedAt` |
| `BillingAdjustmentItems` | `id` | `adjustmentNo`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `currency`, `effectiveMonth`, `adjustedFirst24MonthPrice`, `adjustedNext36MonthPrice` |
| `BillingStatementSnapshots` | `snapshotNo` | `countryCode`, `startDate`, `endDate`, `currencySummary`, `totalQuantity`, `totalAmount`, `itemCount`, `createdAt` |
| `BillingStatementSnapshotItems` | `id` | `snapshotNo`, `countryCode`, `currency`, `instanceContractNo`, `productType`, `unitPriceVatExcluded`, `vatRate`, `unitPriceVatIncluded`, `quantity`, `amount`, `startTime`, `endTime`, `sourceIds`, `createdAt` |

### 8.6 服务费表

| 表 | 主键 | 主要字段 |
| --- | --- | --- |
| `ServiceFeeSnapshots` | `snapshotNo` | `status`, `startMonth`, `endMonth`, `countryCode`, `batchName`, `keyword`, `billingTotal`, `prepaymentTotal`, `serviceFeeTotal`, `instanceServiceFeeTotal`, `feeServiceFeeTotal`, `confirmedAt`, `createdAt`, `updatedAt` |
| `ServiceFeeSnapshotItems` | `id` | `snapshotNo`, `writeOffMonth`, `countryCode`, `batchName`, `requestNo`, `poNo`, `deviceCode`, `modelCode`, `nameEn`, `quantity`, `currency`, `billingCurrency`, `prepaymentCurrency`, `lineType`, `billingAmount`, `prepaymentAmount`, `serviceFeeAmount`, `billingSourceIds`, `prepaymentSourceIds`, `prepaymentContractNos`, `sourceNote`, `createdAt` |
| `WriteOffItems` | `id` | `requestItemId`, `prepaymentContractItemId`, `prepaymentAmountUSD`, `writeOffCurrency`, `writeOffRate`, `startMonth`, `totalMonths` |

## 9. 页面路由

| 页面 | 说明 |
| --- | --- |
| `/` | 首页 |
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

## 10. API 接口

### 10.1 通用实体 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/entities/[entity]` | 查询实体列表，支持 keyword、分页等参数 |
| `POST` | `/api/entities/[entity]` | 新增实体 |
| `GET` | `/api/entities/[entity]/[id]` | 查询单条实体 |
| `PUT` | `/api/entities/[entity]/[id]` | 更新单条实体 |
| `DELETE` | `/api/entities/[entity]/[id]` | 删除单条实体 |
| `GET` | `/api/entities/[entity]/template` | 下载导入模板 |
| `POST` | `/api/entities/[entity]/import` | 批量导入 |
| `GET` | `/api/entities/[entity]/export` | 导出实体数据 |

### 10.2 采购与需求 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/procurement/from-request` | 根据已确认需求生成采购订单草稿 |
| `POST` | `/api/procurement/[poNo]/confirm` | 确认采购订单，并生成物流与状态同步 |
| `GET` | `/api/purchase/product-lines/export` | 导出采购明细一览 |

### 10.3 月账单 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/billing/available` | 查询待生成月账单实例 |
| `POST` | `/api/billing/confirm` | 确认生成月账单台账和 60 个月核销明细 |
| `GET` | `/api/billing/monthly-writeoffs` | 查询月账单每月核销明细 |
| `GET` | `/api/billing/adjustments` | 查询实例合同调整单 |
| `POST` | `/api/billing/adjustments` | 新建实例合同调整单 |
| `GET` | `/api/billing/adjustments/[adjustmentNo]` | 查询调整单详情 |
| `PUT` | `/api/billing/adjustments/[adjustmentNo]` | 保存调整单 |
| `DELETE` | `/api/billing/adjustments/[adjustmentNo]` | 删除调整单 |
| `POST` | `/api/billing/adjustments/[adjustmentNo]/confirm` | 确认调整单并更新后续核销明细 |
| `GET` | `/api/billing/adjustments/[adjustmentNo]/template` | 下载调整单明细导入模板 |
| `POST` | `/api/billing/adjustments/[adjustmentNo]/import` | 导入调整单明细 |
| `GET` | `/api/billing-statements` | 查询或预览月账单对账单 |
| `POST` | `/api/billing-statements` | 保存月账单对账单快照 |
| `GET` | `/api/billing-statements/[snapshotNo]` | 查询对账单快照详情 |
| `GET` | `/api/billing-statements/[snapshotNo]/export` | 按模板导出 Excel 对账单 |

### 10.4 预付款 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/prepayments/available` | 查询待生成预付款实例 |
| `POST` | `/api/prepayments/drafts` | 勾选实例生成预付款合同草稿 |
| `GET` | `/api/prepayments/contracts/[contractNo]` | 查询预付款合同详情 |
| `PUT` | `/api/prepayments/contracts/[contractNo]` | 保存预付款合同草稿 |
| `DELETE` | `/api/prepayments/contracts/[contractNo]` | 删除草稿并释放实例 |
| `POST` | `/api/prepayments/contracts/[contractNo]/confirm` | 确认合同并生成每月核销明细 |
| `GET` | `/api/prepayments/monthly-writeoffs` | 查询预付款每月核销明细 |
| `GET` | `/api/prepayment-adjustments` | 查询预付款核销调整单 |
| `POST` | `/api/prepayment-adjustments` | 新建预付款核销调整单 |
| `GET` | `/api/prepayment-adjustments/available` | 查询可加入调整单的核销明细 |
| `GET` | `/api/prepayment-adjustments/[adjustmentNo]` | 查询调整单详情 |
| `PUT` | `/api/prepayment-adjustments/[adjustmentNo]` | 保存调整单 |
| `DELETE` | `/api/prepayment-adjustments/[adjustmentNo]` | 删除调整单 |
| `POST` | `/api/prepayment-adjustments/[adjustmentNo]/confirm` | 确认调整单 |

### 10.5 服务费与首页 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/service-fees/calculate` | 计算服务费明细 |
| `POST` | `/api/service-fees/snapshots` | 保存服务费快照 |
| `GET` | `/api/dashboard/overview` | 首页统计数据 |

## 11. 核心业务规则

1. 基础数据不设置数据库外键，数据一致性由应用层维护。
2. 需求单支持草稿和确认。确认后状态进入待下单/采购中，并生成采购草稿。
3. 采购订单确认后，采购状态变为已确认，需求单状态变为已下单，并生成物流记录。
4. 月账单按实例合同价格生成 60 个月明细：前 24 个月使用前 24 个月合同价，后 36 个月使用后 36 个月合同价。
5. 实例合同调整单优先级高于实例合同原始价格；同一批次、实例存在多张调整单时，取最近确认的调整单。
6. 预付款合同确认后按合同金额均摊 24 个月生成核销明细。
7. 预付款核销调整单可针对指定实例、指定月份调整核销金额。
8. 服务费 = 月账单核销总额 - 预付款核销金额。
9. 服务费快照和月账单对账单快照保存后不受后续源数据调整影响。
10. 月账单对账单按国家税率计算不含税单价：MX 16%、CL 19%、BR 2.9%。

## 12. 测试说明

测试文件位于 `src/lib/*.test.ts`。重点覆盖：

- 主从单据展示与状态
- 采购和需求状态流转
- 月账单 60 个月核销
- 实例合同调整单优先级
- 预付款合同与调整单
- 服务费计算
- 月账单对账单导出格式
- 分页、数字输入、删除策略、内部标签页状态

运行：

```bash
npm test
```

## 13. 注意事项

1. 当前项目存在部分历史中文乱码文案，不影响核心业务运行，但后续建议统一修正文案编码。
2. Excel 美化导出使用 `exceljs`；普通导入导出仍使用 `xlsx`。
3. 内部标签页采用 iframe 保活方式，点击左侧模块不会卸载已打开页面。
4. 如修改数据库字段，请同步更新 `schema.sql`、`scripts/migrate.ts`、`src/lib/modules.ts` 和相关 API/组件。
5. 如服务端代码修改后页面未生效，需要重新执行 `npm run build` 并重启 `npm run start`。
