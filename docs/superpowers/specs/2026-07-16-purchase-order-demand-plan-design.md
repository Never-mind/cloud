# 采购订单要货计划设计

## 目标

在采购订单详情中完整复刻用友云的“要货计划 SN 码”和“要货计划子”模块。物流不保存或展示 SN 行数据，只提供 PO 订单号到采购订单详情的链接。

## 结构

- 采购订单详情页新增“要货计划 SN 码”和“要货计划子”页签。
- 两个页签均可按采购订单、采购明细维护多条记录；SN 码表一条采购明细可对应任意多条 SN。
- 两张表沿用无数据库外键的项目规则，以 `purchaseOrderId`、`poNo` 和 `purchaseOrderItemId` 由应用层维持关联。

## 字段

### 要货计划 SN 码

`id`、`purchaseOrderId`、`poNo`、`purchaseOrderItemId`、`requestNo`、`sn`、`fixedAssetCode`、`materialDescription`、`shippingBatch`、`parentAssetNo`、`componentCategory`、`packingListNo`、`parentCode`、`finalParentCode`、`level`、`createdAt`、`updatedAt`。

### 要货计划子

`id`、`purchaseOrderId`、`poNo`、`purchaseOrderItemId`、`requestNo`、`sourcePlanId`、`quoteReceivedAt`、`poIssuedAt`、`receiptProofUploadedAt`、`logisticsReceivedAt`、`ataAt`、`ata`、`supplierCpd`、`material`、`createdAt`、`updatedAt`。

## 行为

- 两个页签均支持新建、编辑、删除、Excel 模板下载、导入、导出、关键字过滤、分页及字段显示设置。
- 草稿采购订单可直接编辑；已确认采购订单进入“修改”状态后才可调整。
- 导入必须匹配 PO 订单号与采购明细 ID，或匹配 PO 订单号、需求单号及设备编码；匹配失败须在导入报告中逐行说明。
- 物流列表保持现有一行采购明细一行物流的模型；PO 订单号跳转到 `/purchase/orders/[purchaseOrderId]`。
