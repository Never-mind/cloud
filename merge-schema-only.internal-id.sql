-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: merge
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `merge_cloud_attachments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_attachments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `ownerType` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属对象类型',
  `ownerId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属对象ID',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名称',
  `fileType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `fileSize` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `dataUrl` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件数据',
  `uploadedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人ID',
  `uploadedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人姓名',
  `uploadedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_attachments` (`id`),
  KEY `idx_cloud_attachments_owner` (`ownerType`,`ownerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云附件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_cloud_import_batches`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_import_batches` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `batchCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '批次编码',
  `period` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账期',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名称',
  `rowCount` int NOT NULL DEFAULT '0' COMMENT '数据行数',
  `importedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '导入人ID',
  `importedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '导入人',
  `importedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '导入时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_cloud_import_batches_code` (`batchCode`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_import_batches` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云对账导入批次';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_cloud_mapping_accounts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_mapping_accounts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `mappingId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '映射ID',
  `account` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '华为ID',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_cloud_mapping_account` (`mappingId`,`account`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_mapping_accounts` (`id`),
  KEY `idx_cloud_mapping_accounts_mapping` (`mappingId`),
  KEY `idx_cloud_mapping_accounts_account` (`account`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云账号映射明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_cloud_mappings`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_mappings` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `supplierName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商名称',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位ID',
  `undertakingUnitName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位名称',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `customerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户名称',
  `reconciler` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '华为对账人',
  `calculationLogic` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'catalog' COMMENT '计算逻辑',
  `customCalculationLogic` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '自定义计算逻辑',
  `userDiscount` decimal(10,6) DEFAULT NULL COMMENT '用户折扣',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_mappings` (`id`),
  KEY `idx_cloud_mappings_customer` (`customerId`),
  KEY `idx_cloud_mappings_supplier` (`supplierId`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云账号映射';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_cloud_rows`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_rows` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `importBatchId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '导入批次ID',
  `period` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账期',
  `batchCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '批次编码',
  `mappingId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '映射ID',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `supplierName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商名称',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `customer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户',
  `account` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '华为ID',
  `owner` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账号负责人',
  `collectionEntity` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收款主体',
  `catalogAmount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '目录价（USD）',
  `partnerAmount` decimal(18,4) DEFAULT NULL COMMENT '伙伴结算金额（USD）',
  `supplierPayable` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '供应商应付金额',
  `supplierTaxRate` decimal(10,6) DEFAULT NULL COMMENT '供应商税率',
  `customerReceivable` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '客户应收金额',
  `customerTaxRate` decimal(10,6) DEFAULT NULL COMMENT '客户承担税率',
  `grossProfit` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '毛利润',
  `calculationLogic` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '计算逻辑',
  `customerDiscount` decimal(10,6) DEFAULT NULL COMMENT '客户折扣',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `collectionInvoice` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_issued' COMMENT '客户开票状态',
  `collected` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已回款',
  `confirmed` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已确认',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `paymentDate` date DEFAULT NULL COMMENT '合同付款日期',
  `collectionPayer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收付款单位',
  `collectionPayee` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收收款单位',
  `collectionCurrency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收币种',
  `collectionExchangeRate` decimal(18,8) DEFAULT NULL COMMENT '客户实收汇率',
  `collectionNetAmount` decimal(18,4) DEFAULT NULL COMMENT '客户实收未税金额',
  `collectionTaxRate` decimal(10,6) DEFAULT NULL COMMENT '客户实收税率',
  `collectionTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '客户实收税金',
  `collectionTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '客户实收含税金额',
  `collectionDate` date DEFAULT NULL COMMENT '客户实收日期',
  `receivableDate` date DEFAULT NULL COMMENT '应收日期',
  `collectionRegisteredAt` datetime DEFAULT NULL COMMENT '客户实收登记时间',
  `collectionProofFile` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收凭证',
  `invoiceFile` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票附件',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `cloudReconciler` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '华为对账人',
  `voucherCustomerAmount` decimal(18,4) DEFAULT NULL COMMENT '代金券-客户（USD）',
  `voucherSupplierAmount` decimal(18,4) DEFAULT NULL COMMENT '代金券-供应商（USD）',
  `supplierPayablePayer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商应付付款单位',
  `supplierPayablePayee` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商应付收款单位',
  `supplierPayableNetAmount` decimal(18,4) DEFAULT NULL COMMENT '供应商应付未税金额',
  `supplierTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '供应商应付税金',
  `supplierPayableTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '供应商应付含税金额',
  `customerReceivablePayer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户应收付款单位',
  `customerReceivablePayee` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户应收收款单位',
  `customerReceivableNetAmount` decimal(18,4) DEFAULT NULL COMMENT '客户应收未税金额',
  `customerReceivableTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '客户应收税金',
  `customerReceivableTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '客户应收含税金额',
  `theoreticalGrossProfit` decimal(18,4) DEFAULT NULL COMMENT '理论毛利（USD）',
  `settlementGrossProfit` decimal(18,4) DEFAULT NULL COMMENT '结算毛利（USD）',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `invoiceCurrency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票币种',
  `invoicePayer` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户开票付款单位',
  `invoicePayee` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户开票收款单位',
  `invoiceNetAmount` decimal(18,4) DEFAULT NULL COMMENT '发票未税金额',
  `invoiceTaxRate` decimal(10,6) DEFAULT NULL COMMENT '发票税率',
  `invoiceTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '发票税金',
  `invoiceTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '发票含税金额',
  `invoiceDate` date DEFAULT NULL COMMENT '发票日期',
  `invoiceExchangeRate` decimal(18,8) DEFAULT NULL COMMENT '发票汇率',
  `collectionPayerCustomerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收付款客户ID',
  `collectionPayeeUndertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户实收收款承接单位ID',
  `invoicePayerCustomerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户开票付款客户ID',
  `invoicePayeeUndertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户开票收款承接单位ID',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_rows` (`id`),
  KEY `idx_cloud_rows_period` (`period`,`batchCode`),
  KEY `idx_cloud_rows_customer` (`customerId`,`account`),
  KEY `idx_cloud_rows_supplier` (`supplierId`,`period`),
  KEY `idx_cloud_rows_status` (`confirmed`,`collected`,`collectionInvoice`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云对账明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_cloud_supplier_payments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_cloud_supplier_payments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `period` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账期',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `supplierName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商名称',
  `payerUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款单位ID',
  `payerUnitName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款单位名称',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `paymentExchangeRate` decimal(18,8) DEFAULT NULL COMMENT '付款汇率',
  `paymentNetAmount` decimal(18,4) DEFAULT NULL COMMENT '付款未税金额',
  `paymentTaxRate` decimal(10,6) DEFAULT NULL COMMENT '付款税率',
  `paymentTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '付款税金',
  `paymentTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '付款含税金额',
  `paymentDate` date DEFAULT NULL COMMENT '合同付款日期',
  `receivableDate` date DEFAULT NULL COMMENT '应收日期',
  `paymentRegisteredAt` datetime DEFAULT NULL COMMENT '付款登记时间',
  `invoiceStatus` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_issued' COMMENT '开票状态',
  `invoiceFile` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票附件',
  `paid` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已付款',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `invoiceCurrency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票币种',
  `invoiceExchangeRate` decimal(18,8) DEFAULT NULL COMMENT '发票汇率',
  `invoiceNetAmount` decimal(18,4) DEFAULT NULL COMMENT '发票未税金额',
  `invoiceTaxRate` decimal(10,6) DEFAULT NULL COMMENT '发票税率',
  `invoiceTaxAmount` decimal(18,4) DEFAULT NULL COMMENT '发票税金',
  `invoiceTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '发票含税金额',
  `invoiceDate` date DEFAULT NULL COMMENT '发票日期',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_cloud_supplier_payments` (`id`),
  UNIQUE KEY `uk_cloud_supplier_payment_period` (`period`,`supplierId`),
  KEY `idx_cloud_supplier_payment_status` (`period`,`paid`,`invoiceStatus`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='华为云供应商付款汇总';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_attachments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_attachments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `attachmentId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '附件ID',
  `ownerType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属对象类型',
  `ownerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '所属对象ID',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名称',
  `fileType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `fileSize` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `dataUrl` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件数据',
  `uploadedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_attachments` (`attachmentId`),
  KEY `idx_common_attachments_owner` (`ownerType`,`ownerId`,`uploadedAt`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用附件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_customer_bank_accounts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_customer_bank_accounts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `accountId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '银行账户ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `accountName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账户名称',
  `bankName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行名称',
  `bankAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行账号',
  `bankRoutingNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行行号',
  `swiftCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SWIFT Code（国际银行代码）',
  `currency` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `otherCurrency` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '其他币种',
  `bankAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '银行地址',
  `isDefault` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认银行账户',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_customer_bank_accounts` (`accountId`),
  KEY `idx_common_customer_accounts_customer` (`customerId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户银行账户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_customer_contacts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_customer_contacts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `contactId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '联系人ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务',
  `phone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `isPrimary` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认联系人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_customer_contacts` (`contactId`),
  KEY `idx_common_customer_contacts_customer` (`customerId`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户联系人';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_customers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_customers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `customerCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `nameCn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `shortName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '简称',
  `taxNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '税号',
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家或地区',
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '地址',
  `contactName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系人姓名',
  `contactPhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  `contactEmail` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系邮箱',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `businessTypes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '合作业务',
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '城市',
  `cooperationStatus` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_cooperated' COMMENT '合作状态',
  `website` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '官网',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_common_customers_name` (`name`),
  UNIQUE KEY `uk_internal_legacy_merge_common_customers` (`customerId`),
  UNIQUE KEY `uk_common_customers_code` (`customerCode`),
  KEY `idx_common_customers_keyword` (`name`,`shortName`,`contactPhone`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户基础资料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_document_files`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_document_files` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `fileId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件ID',
  `folderId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件夹ID',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名称',
  `fileType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `fileSize` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `dataUrl` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件数据',
  `uploadedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人ID',
  `uploadedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_document_files` (`fileId`),
  KEY `idx_common_document_files_folder` (`folderId`),
  KEY `idx_common_document_files_uploaded` (`uploadedByUserId`,`uploadedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共文档文件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_document_folders`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_document_folders` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `folderId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件夹ID',
  `parentId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上级记录ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `domainKey` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务域编码',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_document_folders` (`folderId`),
  KEY `idx_common_document_folders_parent` (`parentId`),
  KEY `idx_common_document_folders_domain` (`domainKey`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公共文档文件夹';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_modules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_modules` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `moduleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能模块编码',
  `moduleName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能模块名称',
  `parentModuleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上级功能模块编码',
  `domainKey` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务域编码',
  `route` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '页面路由',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `adminOnly` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否仅管理员可用',
  `remark` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_modules` (`moduleKey`),
  KEY `idx_common_modules_domain` (`domainKey`,`sortOrder`),
  KEY `idx_common_modules_parent` (`parentModuleKey`)
) ENGINE=InnoDB AUTO_INCREMENT=67 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统功能模块配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_operation_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_operation_logs` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `logId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '日志ID',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户ID',
  `userName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户名称',
  `domainKey` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务域编码',
  `moduleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '功能模块编码',
  `action` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '操作类型',
  `entityType` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务对象类型',
  `entityId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '业务对象ID',
  `requestId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '请求ID',
  `detailJson` json DEFAULT NULL COMMENT '操作详情',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_operation_logs` (`logId`),
  KEY `idx_common_operation_logs_entity` (`entityType`,`entityId`),
  KEY `idx_common_operation_logs_user` (`userId`,`createdAt`),
  KEY `idx_common_operation_logs_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作日志';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_supplier_bank_accounts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_supplier_bank_accounts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `accountId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '银行账户ID',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `accountName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账户名称',
  `bankName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行名称',
  `bankAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行账号',
  `bankRoutingNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行行号',
  `swiftCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SWIFT Code（国际银行代码）',
  `currency` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `bankAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '银行地址',
  `isDefault` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认银行账户',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_supplier_bank_accounts` (`accountId`),
  KEY `idx_common_supplier_accounts_supplier` (`supplierId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商银行账户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_supplier_contacts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_supplier_contacts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `contactId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '联系人ID',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务',
  `phone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `isPrimary` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认联系人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_supplier_contacts` (`contactId`),
  KEY `idx_common_supplier_contacts_supplier` (`supplierId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商联系人';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_suppliers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_suppliers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `supplierCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商编码',
  `nameCn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `shortName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '简称',
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家或地区',
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '城市',
  `registeredAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '注册地址',
  `taxNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '税号',
  `supplierType` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'third_party' COMMENT '供应商类型',
  `supplyCategories` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '主要供应品类',
  `brands` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '品牌',
  `cooperationStatus` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_cooperated' COMMENT '合作状态',
  `website` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '官网',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `contactName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系人姓名',
  `contactPhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  `contactEmail` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系邮箱',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_common_suppliers_code` (`supplierCode`),
  UNIQUE KEY `uk_common_suppliers_name` (`nameCn`),
  UNIQUE KEY `uk_internal_legacy_merge_common_suppliers` (`supplierId`),
  KEY `idx_common_suppliers_keyword` (`supplierCode`,`nameCn`,`shortName`),
  KEY `idx_common_suppliers_status` (`cooperationStatus`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='供应商基础资料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_undertaking_unit_bank_accounts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_undertaking_unit_bank_accounts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `accountId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '银行账户ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位ID',
  `accountName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账户名称',
  `bankName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行名称',
  `bankAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行账号',
  `bankRoutingNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行行号',
  `swiftCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SWIFT Code（国际银行代码）',
  `currency` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `bankAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '银行地址',
  `isDefault` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认银行账户',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_unit_bank_accounts` (`accountId`),
  KEY `idx_common_undertaking_accounts_unit` (`undertakingUnitId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='承接单位银行账户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_undertaking_unit_contacts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_undertaking_unit_contacts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `contactId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '联系人ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务',
  `phone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `isPrimary` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否默认联系人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_unit_contacts` (`contactId`),
  KEY `idx_common_undertaking_contacts_unit` (`undertakingUnitId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='承接单位联系人';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_undertaking_units`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_undertaking_units` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位ID',
  `undertakingUnitCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `nameCn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `shortName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '简称',
  `country` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家或地区',
  `city` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '城市',
  `registeredAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '注册地址',
  `taxNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '税号',
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '地址',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `bankAccount` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '银行账号',
  `contactName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系人姓名',
  `contactPhone` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  `contactEmail` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系邮箱',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `entityCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主体编码',
  `entityName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主体名称',
  `cooperationStatus` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'not_cooperated' COMMENT '合作状态',
  `website` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '官网',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_common_undertaking_units_code` (`undertakingUnitCode`),
  UNIQUE KEY `uk_common_undertaking_units_name` (`name`),
  UNIQUE KEY `uk_internal_legacy_merge_common_undertaking_units` (`undertakingUnitId`),
  KEY `idx_common_undertaking_units_keyword` (`undertakingUnitCode`,`name`,`shortName`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='承接单位基础资料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_user_permissions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_user_permissions` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `moduleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能模块编码',
  `canView` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可查看',
  `canCreate` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可新增',
  `canUpdate` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可修改',
  `canDelete` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可删除',
  `canExport` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可导出',
  `canImport` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可导入',
  `canConfirm` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可确认',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_user_permissions` (`userId`,`moduleKey`),
  KEY `idx_common_permissions_module` (`moduleKey`)
) ENGINE=InnoDB AUTO_INCREMENT=177 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户功能权限';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_user_preferences`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_user_preferences` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `preferenceKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '偏好设置项',
  `preferenceValue` json NOT NULL COMMENT '偏好设置值',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_common_user_preferences` (`userId`,`preferenceKey`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户界面偏好设置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_common_users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_common_users` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `displayName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '邮箱',
  `passwordHash` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码哈希',
  `passwordSalt` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码盐值',
  `role` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user' COMMENT '用户角色',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `lastLoginAt` datetime DEFAULT NULL COMMENT '最后登录时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_common_users_email` (`email`),
  UNIQUE KEY `uk_internal_legacy_merge_common_users` (`userId`),
  KEY `idx_common_users_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户账户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_customer_po_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_customer_po_items` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `poId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO ID',
  `lineNo` int NOT NULL DEFAULT '1' COMMENT '行号',
  `customerSku` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户产品编码',
  `customerProductName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户产品名称',
  `customerSpec` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户规格',
  `customerBrand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户品牌',
  `unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '单位',
  `quantity` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '数量',
  `targetUnitPrice` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '目标含税单价',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `matchedProductId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '匹配产品ID',
  `matchedProductCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '匹配产品编码',
  `productMasterId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品主档ID',
  `productModelId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品型号ID',
  `productSpecId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品规格ID',
  `matchStatus` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unmatched' COMMENT '匹配状态',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_customer_po_items` (`id`),
  KEY `idx_po_customer_po_items_po` (`poId`,`lineNo`),
  KEY `idx_po_customer_po_items_code` (`matchedProductCode`)
) ENGINE=InnoDB AUTO_INCREMENT=95 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户PO明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_customer_pos`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_customer_pos` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `poNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `projectName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '项目名称',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `poDate` date NOT NULL COMMENT 'PO日期',
  `deliveryDate` date DEFAULT NULL COMMENT '交付日期',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `quotationId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报价单ID',
  `quotationNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报价单号',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_customer_pos_no` (`poNo`),
  UNIQUE KEY `uk_internal_legacy_merge_po_customer_pos` (`id`),
  KEY `idx_po_customer_pos_customer` (`customerId`,`status`),
  KEY `idx_po_customer_pos_date` (`poDate`),
  KEY `idx_po_customer_pos_undertaking_unit` (`undertakingUnitId`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户PO主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_customer_product_aliases`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_customer_product_aliases` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `customerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户名称',
  `customerSku` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户产品编码',
  `customerProductName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户产品名称',
  `customerSpec` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户规格',
  `customerBrand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户品牌',
  `productId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品ID',
  `productCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品编码',
  `productName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `productMasterId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品主档ID',
  `productModelId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品型号ID',
  `productSpecId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品规格ID',
  `specificationKey` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格匹配键',
  `specificationName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格名称',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_customer_product_aliases` (`id`),
  KEY `idx_po_customer_alias_lookup` (`customerId`,`customerSku`,`customerProductName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户产品别名匹配';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_history_quotations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_history_quotations` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `quotationId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报价单ID',
  `quotationDate` date NOT NULL COMMENT '报价日期',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `productCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品编码',
  `productName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `productMasterId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品主档ID',
  `productModelId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品型号ID',
  `productSpecId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品规格ID',
  `customerPrice` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '客户报价',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_history_quotations` (`id`),
  KEY `idx_po_history_customer_product` (`customerId`,`productCode`,`quotationDate`),
  KEY `idx_po_history_product` (`productCode`,`quotationDate`)
) ENGINE=InnoDB AUTO_INCREMENT=80 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='历史报价参考';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_product_masters`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_product_masters` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `masterCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `specification` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规格',
  `brand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品牌',
  `category` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品类',
  `tariffRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '关税税率',
  `unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pcs' COMMENT '单位',
  `suggestedPurchaseUnitPrice` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '建议采购价',
  `length` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '长度（cm）',
  `width` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '宽度（cm）',
  `height` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '高度（cm）',
  `grossWeight` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '毛重（kg）',
  `hsCodeCn` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中国HS编码',
  `hsCodeMx` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '墨西哥HS编码',
  `needNom` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要NOM认证',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '描述',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_product_masters_code` (`masterCode`),
  UNIQUE KEY `uk_internal_legacy_merge_po_product_masters` (`id`),
  KEY `idx_po_product_masters_keyword` (`masterCode`,`name`,`category`),
  KEY `idx_po_product_masters_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=64 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品主档';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_quotation_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_quotation_items` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `quotationId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报价单ID',
  `lineNo` int NOT NULL DEFAULT '1' COMMENT '行号',
  `productCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品编码',
  `productName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `productMasterId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品主档ID',
  `productModelId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品型号ID',
  `productSpecId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品规格ID',
  `quantity` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '数量',
  `unitPrice` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '销售单价',
  `amount` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '金额',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `brand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品牌',
  `purchaseCurrency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '采购币种',
  `purchaseUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购不含税单价',
  `purchaseTotalOriginal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购原币不含税总价',
  `purchaseTotalUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购不含税总价（USD）',
  `transportType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'sea' COMMENT '运输方式',
  `isCustomsClearance` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否清关',
  `firstMileFreightUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '头程运费（USD）',
  `cifUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CIF金额（USD）',
  `tariffRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '关税税率',
  `tariffUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '关税金额（USD）',
  `capitalCostUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '资金成本（USD）',
  `customsFeeUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '清关手续费（USD）',
  `nomFeeUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'NOM认证费（USD）',
  `publicFeeAllocationUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '公共费用分摊（USD）',
  `ddpTotalUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'DDP不含税总价（USD）',
  `ddpUnitPriceUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'DDP不含税单价（USD）',
  `ddpQuoteUnitUsd` decimal(18,4) DEFAULT NULL COMMENT 'DDP报价单价（USD）',
  `revenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '销售收入（USD）',
  `operatingProfitUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '经营利润（USD）',
  `grossMarginRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '毛利率',
  `markupRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '加价率',
  `enableNom` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否NOM认证',
  `historicalDdpQuoteUsd` decimal(18,4) DEFAULT NULL COMMENT '历史DDP报价（USD）',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_quotation_items` (`id`),
  KEY `idx_po_quotation_items_quotation` (`quotationId`,`lineNo`),
  KEY `idx_po_quotation_items_product` (`productCode`)
) ENGINE=InnoDB AUTO_INCREMENT=95 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_quotations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_quotations` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `quotationNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报价单号',
  `projectName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '项目名称',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `contractingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `sourcePoId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源客户PO ID',
  `sourcePoNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源客户PO号',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `totalAmount` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '总金额',
  `totalProfit` decimal(14,4) NOT NULL DEFAULT '0.0000' COMMENT '总利润',
  `grossMarginRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '毛利率',
  `status` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `exchangeRateUsd` decimal(18,8) NOT NULL DEFAULT '6.82000000' COMMENT '美元汇率',
  `exchangeRateMxn` decimal(18,8) NOT NULL DEFAULT '0.06000000' COMMENT '墨西哥比索汇率',
  `capitalCostRate` decimal(10,6) NOT NULL DEFAULT '6.000000' COMMENT '资金成本率',
  `accountPeriod` decimal(10,4) NOT NULL DEFAULT '2.0000' COMMENT '账期（月）',
  `badDebtRate` decimal(10,6) NOT NULL DEFAULT '1.000000' COMMENT '坏账率',
  `customsFeeRate` decimal(10,6) NOT NULL DEFAULT '0.800000' COMMENT '清关手续费率',
  `vatOverseas` decimal(10,6) NOT NULL DEFAULT '16.000000' COMMENT '海外增值税率',
  `markupRate` decimal(10,6) NOT NULL DEFAULT '20.000000' COMMENT '加价率',
  `seaFreightRate` decimal(18,4) NOT NULL DEFAULT '3200.0000' COMMENT '海运费率',
  `airFreightRate` decimal(18,4) NOT NULL DEFAULT '100.0000' COMMENT '空运费率',
  `nomFee` decimal(18,4) NOT NULL DEFAULT '700.0000' COMMENT 'NOM认证费',
  `customsMiscFee` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '其他清关费用',
  `lastMileFee` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '尾程费',
  `storageOperationFee` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '仓储操作费',
  `implementationFee` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '实施费',
  `publicFeeTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '公共费用合计',
  `totalCifUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CIF总额（USD）',
  `totalDdpUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'DDP总额（USD）',
  `totalRevenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '销售收入总额（USD）',
  `totalProfitUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '利润总额（USD）',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_quotations_no` (`quotationNo`),
  UNIQUE KEY `uk_internal_legacy_merge_po_quotations` (`id`),
  KEY `idx_po_quotations_customer` (`customerId`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报价单主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_attachments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_attachments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目ID',
  `invoiceId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票ID',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件名称',
  `fileType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `fileSize` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `dataUrl` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件数据',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `uploadedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人ID',
  `uploadedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人姓名',
  `uploadedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_attachments` (`id`),
  KEY `idx_po_settlement_attachments_project` (`projectId`),
  KEY `idx_po_settlement_attachments_invoice` (`invoiceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算附件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_expenses`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_expenses` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目ID',
  `type` varchar(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '类型',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `amount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '金额',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `priceType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tax_included' COMMENT '价格类型',
  `taxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '税率',
  `costUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '成本USD',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_expenses` (`id`),
  KEY `idx_po_settlement_expenses_project` (`projectId`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算费用明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_invoices`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_invoices` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目ID',
  `type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'cost' COMMENT '类型',
  `accountPeriod` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账期（月）',
  `accountingDate` date DEFAULT NULL COMMENT '财务记账日期',
  `companyEntity` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位',
  `invoiceEntity` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商/客户',
  `companyEntityId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `invoiceEntityId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商或客户ID',
  `invoiceEntityType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票主体类型',
  `invoiceDate` date DEFAULT NULL COMMENT '发票日期',
  `receivableDate` date DEFAULT NULL COMMENT '应收日期',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `invoiceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '发票含税总额',
  `invoiceTaxExcludedTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '发票未税总额',
  `taxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '税率',
  `invoiceTaxAmount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '发票税金',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '币种',
  `exchangeRate` decimal(18,8) NOT NULL DEFAULT '1.00000000' COMMENT '汇率',
  `usdAmount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '折算美元金额',
  `isPaid` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否支付',
  `isInvoiced` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否开票',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_invoices` (`id`),
  KEY `idx_po_settlement_invoices_project` (`projectId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算发票记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_items` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目ID',
  `quotationItemId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报价单明细ID',
  `lineNo` int NOT NULL DEFAULT '1' COMMENT '行号',
  `productId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品ID',
  `productCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品编码',
  `productName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品名称',
  `brand` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品牌',
  `plannedQty` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '计划数量',
  `purchaseQty` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购数量',
  `purchaseUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购不含税单价',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `priceType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tax_excluded' COMMENT '价格类型',
  `taxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '税率',
  `quotedWarehouseCostUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '报价到仓成本（USD）',
  `quotedSalesRevenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '报价销售收入（USD）',
  `purchasedCostUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已采购成本（USD）',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `ordered` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已下单',
  `orderedAt` datetime DEFAULT NULL COMMENT '下单时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_settlement_items_quotation` (`quotationItemId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_items` (`id`),
  KEY `idx_po_settlement_items_project` (`projectId`,`ordered`)
) ENGINE=InnoDB AUTO_INCREMENT=80 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算商品明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_projects`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_projects` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目单号',
  `quotationId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报价单ID',
  `quotationNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '报价单号',
  `projectName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '项目名称',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `customerName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户名称',
  `contractingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `contractingUnitName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位名称',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `exchangeRateUsd` decimal(18,8) NOT NULL DEFAULT '1.00000000' COMMENT '美元汇率',
  `exchangeRateMxn` decimal(18,8) NOT NULL DEFAULT '1.00000000' COMMENT '墨西哥比索汇率',
  `quotedPurchaseCostUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '报价采购成本（USD）',
  `purchasedCostUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已采购成本（USD）',
  `quotedSalesRevenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '报价销售收入（USD）',
  `receivedRevenueTaxIncludedUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已销售收入（含税 USD）',
  `receivedRevenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已销售收入（未税 USD）',
  `grossProfitUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '毛利润USD',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'purchasing' COMMENT '状态',
  `procurementCompletedAt` datetime DEFAULT NULL COMMENT '采购完成时间',
  `acceptanceStartedAt` datetime DEFAULT NULL COMMENT '验收开始时间',
  `closedAt` datetime DEFAULT NULL COMMENT '关闭时间',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_settlement_projects_quotation` (`quotationId`),
  UNIQUE KEY `uk_po_settlement_projects_no` (`projectNo`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_projects` (`id`),
  KEY `idx_po_settlement_projects_filter` (`status`,`customerId`,`createdAt`),
  KEY `idx_po_settlement_projects_keyword` (`projectNo`,`quotationNo`,`customerName`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_settlement_sales`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_settlement_sales` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `projectId` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '项目ID',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '描述',
  `amount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '金额',
  `currency` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `priceType` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'tax_included' COMMENT '价格类型',
  `taxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '税率',
  `receivedRevenueTaxIncludedUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已销售收入（含税 USD）',
  `receivedRevenueUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '已销售收入（未税 USD）',
  `invoiceNo` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `receivedAt` date DEFAULT NULL COMMENT '收款时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_po_settlement_sales` (`id`),
  KEY `idx_po_settlement_sales_project` (`projectId`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='项目结算销售收入明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_po_tariff_rates`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_po_tariff_rates` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `deviceType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '产品类别',
  `hsCode` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'HS编码',
  `taxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '税率',
  `needNom` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否需要NOM认证',
  `remark` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_po_tariff_rate_device_hs` (`deviceType`,`hsCode`),
  UNIQUE KEY `uk_internal_legacy_merge_po_tariff_rates` (`id`),
  KEY `idx_po_tariff_rates_hs` (`hsCode`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品类别';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_appusers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_appusers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '邮箱',
  `passwordHash` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码哈希',
  `passwordSalt` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '密码盐值',
  `displayName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示名称',
  `role` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin' COMMENT '用户角色',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `lastLoginAt` datetime DEFAULT NULL COMMENT '最后登录时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_AppUsers_email` (`email`),
  UNIQUE KEY `uk_internal_legacy_merge_power_appusers` (`userId`),
  KEY `idx_AppUsers_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力系统用户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_b6typeconfigs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_b6typeconfigs` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `b6Type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'B6类型',
  `alias` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '别名',
  `scope` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '适用范围',
  `fundingCostIncluded` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否包含资金成本',
  `spareCostIncluded` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否包含备件成本',
  `defaultFundingMonths` int DEFAULT NULL COMMENT '默认资金占用月数',
  `defaultSpareOccupancyMonths` int DEFAULT NULL COMMENT '默认备件占用月数',
  `overseasSpareServiceAvailable` tinyint(1) DEFAULT NULL COMMENT '是否提供海外备件服务',
  `defaultSpareRate` decimal(10,6) DEFAULT NULL COMMENT '默认备件费率',
  `spareSettlementMethod` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备件结算方式',
  `slPricingInstruction` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'SL定价说明',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '启用' COMMENT '状态',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_b6typeconfigs` (`b6Type`),
  KEY `idx_B6TypeConfigs_status_sort` (`status`,`sortOrder`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='B6类型规则';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_balancesettlementfinals`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_balancesettlementfinals` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `finalSettlementNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '最终结算单号',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '币种',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态',
  `periodStart` date NOT NULL COMMENT '账期开始',
  `periodEnd` date NOT NULL COMMENT '账期结束',
  `sourceCount` int NOT NULL DEFAULT '0' COMMENT '来源数量',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `capexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX差额合计',
  `opexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX差额合计',
  `differenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '差额合计',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementfinals` (`finalSettlementNo`),
  KEY `idx_BalanceSettlementFinals_filter` (`countryCode`,`currency`,`status`,`periodStart`,`periodEnd`),
  KEY `idx_BalanceSettlementFinals_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='结差结算单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_balancesettlementfinalsources`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_balancesettlementfinalsources` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `finalSettlementNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '最终结算单号',
  `sourceSettlementNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '来源结算单号',
  `sourceTitle` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源标题',
  `sourceItemTypes` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源明细类型',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '币种',
  `periodStart` date NOT NULL COMMENT '账期开始',
  `periodEnd` date NOT NULL COMMENT '账期结束',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `capexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX差额合计',
  `opexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX差额合计',
  `differenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '差额合计',
  `sourceSnapshotJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源快照数据',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_BalanceSettlementFinalSources_final_source` (`finalSettlementNo`,`sourceSettlementNo`),
  UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementfinalsources` (`id`),
  KEY `idx_BalanceSettlementFinalSources_source` (`sourceSettlementNo`),
  KEY `idx_BalanceSettlementFinalSources_final` (`finalSettlementNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='结差结算单来源明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_balancesettlementitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_balancesettlementitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `settlementNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '结算单号',
  `lineNo` int NOT NULL DEFAULT '0' COMMENT '行号',
  `itemType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '实例' COMMENT '明细类型',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `purchaseOrderItemId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单明细ID',
  `requestItemId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求明细ID',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` decimal(18,4) NOT NULL DEFAULT '1.0000' COMMENT '数量',
  `receiptDate` date DEFAULT NULL COMMENT '收货日期',
  `paymentDate` date DEFAULT NULL COMMENT '合同付款日期',
  `procurementCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购币种',
  `purchaseUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '采购不含税单价',
  `purchaseCapexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购CAPEX单价',
  `purchaseOpexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '采购OPEX单价',
  `settlementCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '结算币种',
  `settlementRate` decimal(18,10) NOT NULL DEFAULT '1.0000000000' COMMENT '结算汇率',
  `settlementCapexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '结算CAPEX单价',
  `settlementOpexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '结算OPEX单价',
  `anchorVersionId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '锚定价格版本ID',
  `anchorVersionNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '锚定价格版本号',
  `anchorItemId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '锚定价格明细ID',
  `anchorCapexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '锚定CAPEX单价',
  `anchorOpexUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '锚定OPEX单价',
  `capexDifferenceUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX差额单价',
  `capexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX差额合计',
  `opexDifferenceUnitPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX差额单价',
  `opexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX差额合计',
  `differenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '差额合计',
  `expenseCategory` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用类别',
  `expenseName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用名称',
  `expenseType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用类型',
  `differenceNature` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '差额性质',
  `expenseDate` date DEFAULT NULL COMMENT '费用日期',
  `documentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '单据单号',
  `deviceNodeQuantity` decimal(18,4) DEFAULT NULL COMMENT '设备节点数量',
  `deliveryQuantity` decimal(18,4) DEFAULT NULL COMMENT '交付数量',
  `settlementQuantity` decimal(18,4) DEFAULT NULL COMMENT '结算数量',
  `taxExcludedUnitPriceUsd` decimal(18,4) DEFAULT NULL COMMENT '未税单价（USD）',
  `priceConfirmation` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '价格确认结果',
  `paymentExchangeRate` decimal(18,10) DEFAULT NULL COMMENT '付款汇率',
  `taxExcludedTotalUsd` decimal(18,4) DEFAULT NULL COMMENT '未税总额（USD）',
  `taxExcludedTotalCny` decimal(18,4) DEFAULT NULL COMMENT '未税总额（CNY）',
  `equipmentTotalUsd` decimal(18,4) DEFAULT NULL COMMENT '设备总额（USD）',
  `localTaxRate` decimal(10,6) DEFAULT NULL COMMENT '当地税率',
  `calculatedTaxAmountUsd` decimal(18,4) DEFAULT NULL COMMENT '计算税额（USD）',
  `feeCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用币种',
  `feeAmount` decimal(18,4) DEFAULT NULL COMMENT '费用金额',
  `expenseProvider` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用提供方',
  `usdExchangeRate` decimal(18,10) DEFAULT NULL COMMENT 'USD汇率比率',
  `settlementAmountUsd` decimal(18,4) DEFAULT NULL COMMENT '结算金额（USD）',
  `issRate` decimal(10,6) DEFAULT NULL COMMENT 'ISS税率',
  `issExcludedAmountUsd` decimal(18,4) DEFAULT NULL COMMENT 'ISS未税金额（USD）',
  `confirmationResult` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认结果',
  `sourceReference` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源引用',
  `sourceSnapshotJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源快照数据',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlementitems` (`id`),
  KEY `idx_BalanceSettlementItems_settlement` (`settlementNo`,`lineNo`),
  KEY `idx_BalanceSettlementItems_purchase` (`purchaseOrderItemId`),
  KEY `idx_BalanceSettlementItems_country_batch` (`countryCode`,`batchName`),
  KEY `idx_BalanceSettlementItems_type` (`itemType`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例结差明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_balancesettlements`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_balancesettlements` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `settlementNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '结算单号',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '职务',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `pricingVersionId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '价格版本ID',
  `pricingVersionNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '价格版本号',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `periodStart` date DEFAULT NULL COMMENT '账期开始',
  `periodEnd` date DEFAULT NULL COMMENT '账期结束',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `capexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX差额合计',
  `opexDifferenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX差额合计',
  `differenceTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '差额合计',
  `sourceFileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源文件名称',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_balancesettlements` (`settlementNo`),
  KEY `idx_BalanceSettlements_country_status` (`countryCode`,`status`),
  KEY `idx_BalanceSettlements_createdAt` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例结差主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_billingadjustmentitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_billingadjustmentitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调整单号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `effectiveMonth` date DEFAULT NULL COMMENT '生效月份',
  `adjustedFirst24MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '调整后前24个月价格',
  `adjustedNext36MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '调整后后36个月价格',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_billingadjustmentitems` (`id`),
  KEY `idx_BillingAdjustmentItems_adjustmentNo` (`adjustmentNo`),
  KEY `idx_BillingAdjustmentItems_target` (`countryCode`,`batchName`,`deviceCode`),
  KEY `idx_BillingAdjustmentItems_effectiveMonth` (`effectiveMonth`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例合同调整单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_billingadjustments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_billingadjustments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调整单号',
  `instanceContractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实例合同号',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '币种',
  `effectiveMonth` date DEFAULT NULL COMMENT '生效月份',
  `adjustedFirst24MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '调整后前24个月价格',
  `adjustedNext36MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '调整后后36个月价格',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '调整原因',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_billingadjustments` (`adjustmentNo`),
  KEY `idx_BillingAdjustments_instanceContractNo` (`instanceContractNo`),
  KEY `idx_BillingAdjustments_target` (`countryCode`,`batchName`,`deviceCode`),
  KEY `idx_BillingAdjustments_effectiveMonth` (`effectiveMonth`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例合同调整单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_billinginstanceledgers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_billinginstanceledgers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `purchaseOrderItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购订单明细ID',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `actualCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实际币种',
  `actualUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '实际单价',
  `taxExcludedUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '未税单位价格',
  `taxSurcharge` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '税费附加',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `selfCalculatedUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '自计算含税单价',
  `instanceContractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实例合同号',
  `contractCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '合同币种',
  `first24MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '前24个月价格',
  `next36MonthPrice` decimal(18,4) DEFAULT NULL COMMENT '后36个月价格',
  `differenceUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '结差单价',
  `differenceTotalPrice` decimal(18,4) DEFAULT NULL COMMENT '结差总价',
  `startMonth` date DEFAULT NULL COMMENT '开始月份',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '核销中' COMMENT '状态',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_BillingInstanceLedgers_purchaseOrderItemId` (`purchaseOrderItemId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_billinginstanceledgers` (`ledgerId`),
  KEY `idx_BillingInstanceLedgers_requestNo` (`requestNo`),
  KEY `idx_BillingInstanceLedgers_deviceCode` (`deviceCode`)
) ENGINE=InnoDB AUTO_INCREMENT=274 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月账单实例台账';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_billingstatementsnapshotitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_billingstatementsnapshotitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `instanceContractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实例合同号',
  `productType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '产品类型',
  `unitPriceVatExcluded` decimal(18,4) DEFAULT NULL COMMENT '未税单位价格',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `unitPriceVatIncluded` decimal(18,4) DEFAULT NULL COMMENT '单位价格增值税含税',
  `quantity` decimal(18,4) DEFAULT NULL COMMENT '数量',
  `amount` decimal(18,4) DEFAULT NULL COMMENT '金额',
  `startTime` date NOT NULL COMMENT '开始时间',
  `endTime` date NOT NULL COMMENT '结束时间',
  `sourceIds` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源ID列表',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_billingstatementsnapshotitems` (`id`),
  KEY `idx_BillingStatementSnapshotItems_snapshotNo` (`snapshotNo`),
  KEY `idx_BillingStatementSnapshotItems_currency` (`currency`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月账单对账单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_billingstatementsnapshots`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_billingstatementsnapshots` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '未确认' COMMENT '状态',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `startDate` date NOT NULL COMMENT '开始日期',
  `endDate` date NOT NULL COMMENT '结束日期',
  `currencySummary` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种汇总',
  `totalQuantity` decimal(18,4) DEFAULT NULL COMMENT '总数量',
  `totalAmount` decimal(18,4) DEFAULT NULL COMMENT '总金额',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_billingstatementsnapshots` (`snapshotNo`),
  KEY `idx_BillingStatementSnapshots_countryCode` (`countryCode`),
  KEY `idx_BillingStatementSnapshots_dates` (`startDate`,`endDate`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月账单对账单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_capexpricingitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_capexpricingitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `versionId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本ID',
  `lineNo` int NOT NULL DEFAULT '0' COMMENT '行号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameZh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `b6Type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'B6类型',
  `spareScenario` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备件场景',
  `spareOccupancyMonths` int DEFAULT NULL COMMENT '备件占用月份',
  `overseasSpareServiceAvailable` tinyint(1) DEFAULT NULL COMMENT '是否提供海外备件服务',
  `spareRate` decimal(10,6) DEFAULT NULL COMMENT '备件费率',
  `spareSettlementMethod` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备件结算方式',
  `priceCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CNY' COMMENT '价格币种',
  `contractCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'USD' COMMENT '合同币种',
  `baseCapexPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '基础CAPEX价格',
  `exchangeRate` decimal(18,10) NOT NULL DEFAULT '0.0000000000' COMMENT '汇率',
  `deviceVatRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '设备增值税比率',
  `serviceVatRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '服务增值税率',
  `brazilServiceTaxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '巴西服务税率',
  `onsiteRmaRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '现场RMA费率',
  `fundingAnnualRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '年度资金费率',
  `fundingMonths` int NOT NULL DEFAULT '0' COMMENT '资金占用月份',
  `fundingRatio` decimal(18,10) NOT NULL DEFAULT '0.0000000000' COMMENT '资金占用比例',
  `fundingAmount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '资金占用金额',
  `capexTotal` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX合计',
  `transportClearanceRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '运输清关费率',
  `handlingRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '操作费率',
  `otherTaxRate` decimal(10,6) NOT NULL DEFAULT '0.000000' COMMENT '其他税率',
  `ddpPrice` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'DDP价格',
  `opexAmount` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX金额',
  `rawCapexAnchorUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '原始CAPEX锚定价（USD）',
  `rawOpexAnchorUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '原始OPEX锚定价（USD）',
  `capexAnchorUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'CAPEX锚定价（USD）',
  `opexAnchorUsd` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT 'OPEX锚定价（USD）',
  `sourceSnapshotJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源快照数据',
  `b6RuleSnapshotJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'B6规则快照数据',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_CapexPricingItems_version_line` (`versionId`,`lineNo`),
  UNIQUE KEY `uk_internal_legacy_merge_power_capexpricingitems` (`id`),
  KEY `idx_CapexPricingItems_version` (`versionId`),
  KEY `idx_CapexPricingItems_device` (`deviceCode`),
  KEY `idx_CapexPricingItems_version_device_b6` (`versionId`,`deviceCode`,`b6Type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成本与锚定价格明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_capexpricingversions`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_capexpricingversions` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `versionId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本ID',
  `versionNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `effectiveDate` date NOT NULL COMMENT '生效日期',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `sourceFileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源文件名称',
  `notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_CapexPricingVersions_version_country` (`versionNo`,`countryCode`),
  UNIQUE KEY `uk_internal_legacy_merge_power_capexpricingversions` (`versionId`),
  KEY `idx_CapexPricingVersions_country_effective` (`countryCode`,`effectiveDate`),
  KEY `idx_CapexPricingVersions_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成本与锚定价格版本';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_contractitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_contractitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备编码',
  `basePrice` decimal(18,4) DEFAULT NULL COMMENT '基础价格',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_contractitems` (`id`),
  KEY `idx_ContractItems_contractNo` (`contractNo`),
  KEY `idx_ContractItems_deviceCode` (`deviceCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例合同明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_countries`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_countries` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `code` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '编码',
  `nameZh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `nameLocal` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '当地语言名称',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_countries` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家基础资料';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_customers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_customers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户ID',
  `customerCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_Customers_customerCode` (`customerCode`),
  UNIQUE KEY `uk_internal_legacy_merge_power_customers` (`customerId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力客户';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_datacenters`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_datacenters` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `dcCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '数据中心编码',
  `locationId` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地点ID',
  `nameZh` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_Datacenters_locationId` (`locationId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_datacenters` (`dcCode`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据中心';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_deliverycontacts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_deliverycontacts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `contactId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '联系人ID',
  `locationId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地点ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `phone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '电话',
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '邮箱',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_deliverycontacts` (`contactId`),
  KEY `idx_DeliveryContacts_locationId` (`locationId`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交付联系人';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_deliverylocations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_deliverylocations` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `locationId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '地点ID',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `locationType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地点类型',
  `nameZh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `fullAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '详细地址',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_deliverylocations` (`locationId`),
  KEY `idx_DeliveryLocations_countryCode` (`countryCode`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='交付地址';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_documentfiles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_documentfiles` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `fileId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件ID',
  `folderId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件夹ID',
  `originalName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '原文件名',
  `storedName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '存储文件名',
  `filePath` varchar(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件路径',
  `mimeType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件类型',
  `extension` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件扩展名',
  `category` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other' COMMENT '品类',
  `fileSize` bigint NOT NULL DEFAULT '0' COMMENT '文件大小',
  `uploadedBy` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_documentfiles` (`fileId`),
  KEY `idx_DocumentFiles_folderId` (`folderId`),
  KEY `idx_DocumentFiles_originalName` (`originalName`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力系统文档文件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_documentfolders`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_documentfolders` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `folderId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '文件夹ID',
  `parentId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上级记录ID',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '名称',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_documentfolders` (`folderId`),
  UNIQUE KEY `uk_DocumentFolders_parent_name` (`parentId`,`name`),
  KEY `idx_DocumentFolders_parentId` (`parentId`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力系统文档文件夹';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_importjobs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_importjobs` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `jobId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '任务ID',
  `targetKey` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标编码',
  `targetTitle` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标名称',
  `fileName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '文件名称',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '状态',
  `totalRows` int NOT NULL DEFAULT '0' COMMENT '总行数',
  `successRows` int NOT NULL DEFAULT '0' COMMENT '成功行数',
  `failedRows` int NOT NULL DEFAULT '0' COMMENT '失败行数',
  `masterCount` int NOT NULL DEFAULT '0' COMMENT '主表数量',
  `detailCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `previewJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '预览数据',
  `reportJson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '处理报告',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_importjobs` (`jobId`),
  KEY `idx_ImportJobs_targetKey` (`targetKey`),
  KEY `idx_ImportJobs_createdAt` (`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='数据导入任务';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_instancecontracts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_instancecontracts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '国家代码',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `instanceModelEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实例型号英文名称',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `first24MonthPriceUSD` decimal(18,4) DEFAULT NULL COMMENT '前24个月价格（USD）',
  `next36MonthPriceUSD` decimal(18,4) DEFAULT NULL COMMENT '后36个月价格（USD）',
  `dateSigned` date DEFAULT NULL COMMENT '签署日期',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '状态',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_instancecontracts` (`id`),
  UNIQUE KEY `uk_InstanceContracts_contract_country_device` (`contractNo`,`countryCode`,`deviceCode`),
  KEY `idx_InstanceContracts_contractNo` (`contractNo`),
  KEY `idx_InstanceContracts_countryCode` (`countryCode`),
  KEY `idx_InstanceContracts_deviceCode` (`deviceCode`)
) ENGINE=InnoDB AUTO_INCREMENT=355 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例合同';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_instancemodels`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_instancemodels` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '型号编码',
  `xxllCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'XXLL编码',
  `nameZh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '中文名称',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `b6Type` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'B6类型',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_instancemodels` (`deviceCode`)
) ENGINE=InnoDB AUTO_INCREMENT=74 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='实例型号';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_internalservicefeeadjustments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_internalservicefeeadjustments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调整单号',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `startMonth` date NOT NULL COMMENT '开始月份',
  `endMonth` date NOT NULL COMMENT '结束月份',
  `monthlyAmount` decimal(18,2) NOT NULL COMMENT '月度金额',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '调整原因',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '已确认' COMMENT '状态',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeeadjustments` (`adjustmentNo`),
  KEY `idx_InternalServiceFeeAdjustments_ledger` (`ledgerId`),
  KEY `idx_InternalServiceFeeAdjustments_range` (`startMonth`,`endMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内部服务费调整单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_internalservicefeesnapshotitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_internalservicefeesnapshotitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `monthlyFeeId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '月度费用ID',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `writeOffMonth` date NOT NULL COMMENT '核销月份',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `internalServiceFeeAmount` decimal(18,2) NOT NULL COMMENT '内部服务费金额',
  `sourceType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源类型',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '调整单号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeesnapshotitems` (`id`),
  KEY `idx_InternalServiceFeeSnapshotItems_snapshot` (`snapshotNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内部服务费归档快照明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_internalservicefeesnapshots`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_internalservicefeesnapshots` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `archiveMonth` date NOT NULL COMMENT '归档月份',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `totalAmount` decimal(18,2) NOT NULL DEFAULT '0.00' COMMENT '总金额',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_internalservicefeesnapshots` (`snapshotNo`),
  KEY `idx_InternalServiceFeeSnapshots_month` (`archiveMonth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内部服务费归档快照';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_internalserviceledgers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_internalserviceledgers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `procurementTaxExcludedUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '采购未税单位价格',
  `procurementTaxSurcharge` decimal(18,4) DEFAULT NULL COMMENT '采购税费附加',
  `contractRevenueIncludingTax` decimal(18,2) DEFAULT NULL COMMENT '合同收入含税金额',
  `contractRevenueExcludingTax` decimal(18,2) DEFAULT NULL COMMENT '合同收入未税金额',
  `procurementCost` decimal(18,2) DEFAULT NULL COMMENT '采购成本',
  `internalServiceFeeTotal` decimal(18,2) DEFAULT NULL COMMENT '内部服务费合计',
  `archivedAmount` decimal(18,2) DEFAULT NULL COMMENT '已归档金额',
  `manualAmount` decimal(18,2) DEFAULT NULL COMMENT '手工金额',
  `remainingAmount` decimal(18,2) DEFAULT NULL COMMENT '剩余金额',
  `unallocatedAmount` decimal(18,2) DEFAULT NULL COMMENT '未分配金额',
  `startMonth` date DEFAULT NULL COMMENT '开始月份',
  `status` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '已生成' COMMENT '状态',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_internalserviceledgers` (`ledgerId`),
  KEY `idx_InternalServiceLedgers_country` (`countryCode`),
  KEY `idx_InternalServiceLedgers_request` (`requestNo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内部服务费台账';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_modulefeatures`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_modulefeatures` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `moduleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能模块编码',
  `moduleName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '功能模块名称',
  `parentModuleKey` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上级功能模块编码',
  `enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `sortOrder` int NOT NULL DEFAULT '0' COMMENT '排序号',
  `remark` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `updatedBy` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_modulefeatures` (`moduleKey`),
  KEY `idx_ModuleFeatures_enabled_sort` (`enabled`,`sortOrder`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力系统模块功能配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_monthlybillingwriteoffs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_monthlybillingwriteoffs` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(112) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `writeOffMonth` date NOT NULL COMMENT '核销月份',
  `monthIndex` int NOT NULL COMMENT '月份序号',
  `stage` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '价格阶段',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `instanceContractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实例合同号',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `monthlyAmount` decimal(18,4) DEFAULT NULL COMMENT '月度金额',
  `monthlyTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '月度总金额',
  `selfCalculatedUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '自计算含税单价',
  `differenceUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '结差单价',
  `differenceTotalPrice` decimal(18,4) DEFAULT NULL COMMENT '结差总价',
  `sourceType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源类型',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '调整单号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_monthlybillingwriteoffs` (`id`),
  KEY `idx_MonthlyBillingWriteOffs_ledgerId` (`ledgerId`),
  KEY `idx_MonthlyBillingWriteOffs_writeOffMonth` (`writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_country_batch_month` (`countryCode`,`batchName`,`writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_country_month_batch` (`countryCode`,`writeOffMonth`,`batchName`),
  KEY `idx_MonthlyBillingWriteOffs_batch_month` (`batchName`,`writeOffMonth`),
  KEY `idx_MonthlyBillingWriteOffs_adjustmentNo` (`adjustmentNo`)
) ENGINE=InnoDB AUTO_INCREMENT=16381 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='月账单每月核销明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_monthlyinternalservicefees`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_monthlyinternalservicefees` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `ledgerId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '台账ID',
  `writeOffMonth` date NOT NULL COMMENT '核销月份',
  `monthIndex` int NOT NULL COMMENT '月份序号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `internalServiceFeeAmount` decimal(18,2) NOT NULL DEFAULT '0.00' COMMENT '内部服务费金额',
  `sourceType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'auto' COMMENT '来源类型',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '调整单号',
  `archived` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已归档',
  `archiveSnapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '归档快照单号',
  `archivedAt` datetime DEFAULT NULL COMMENT '归档时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_MonthlyInternalServiceFees_ledger_month` (`ledgerId`,`writeOffMonth`),
  UNIQUE KEY `uk_internal_legacy_merge_power_monthlyinternalservicefees` (`id`),
  KEY `idx_MonthlyInternalServiceFees_month` (`writeOffMonth`),
  KEY `idx_MonthlyInternalServiceFees_country` (`countryCode`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内部服务费月度分摊';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_monthlyprepaymentwriteoffs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_monthlyprepaymentwriteoffs` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `contractLineId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同行ID',
  `writeOffMonth` date NOT NULL COMMENT '核销月份',
  `monthIndex` int NOT NULL COMMENT '月份序号',
  `totalMonths` int NOT NULL COMMENT '总月数',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `originalAmount` decimal(18,4) DEFAULT NULL COMMENT '原金额',
  `monthlyAmount` decimal(18,4) DEFAULT NULL COMMENT '月度金额',
  `lineType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '明细类型',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `sourceType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源类型',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '调整单号',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_monthlyprepaymentwriteoffs` (`id`),
  KEY `idx_MonthlyPrepaymentWriteOffs_contractNo` (`contractNo`),
  KEY `idx_MonthlyPrepaymentWriteOffs_contractLineId` (`contractLineId`),
  KEY `idx_MonthlyPrepaymentWriteOffs_writeOffMonth` (`writeOffMonth`),
  KEY `idx_MonthlyPrepaymentWriteOffs_country_batch_month` (`countryCode`,`batchName`,`writeOffMonth`),
  KEY `idx_MonthlyPrepaymentWriteOffs_country_month_batch` (`countryCode`,`writeOffMonth`,`batchName`),
  KEY `idx_MonthlyPrepaymentWriteOffs_batch_month` (`batchName`,`writeOffMonth`)
) ENGINE=InnoDB AUTO_INCREMENT=241 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预付款每月核销明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_prepaymentcontractitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_prepaymentcontractitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `lineType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'instance' COMMENT '明细类型',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `purchaseOrderItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单明细ID',
  `requestItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求明细ID',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `actualCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '实际币种',
  `actualUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '实际单价',
  `actualTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '实际总金额',
  `contractCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '合同币种',
  `contractUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '合同单价',
  `contractTotalAmount` decimal(18,4) DEFAULT NULL COMMENT '合同总金额',
  `writeOffStartMonth` date DEFAULT NULL COMMENT '核销开始月份',
  `feeName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '费用名称',
  `feeDescription` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '费用说明',
  `prepaymentAmount` decimal(18,4) DEFAULT NULL COMMENT '预付款金额',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `usdRate` decimal(18,8) DEFAULT NULL COMMENT 'USD比率',
  `paymentDate` date DEFAULT NULL COMMENT '合同付款日期',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentcontractitems` (`id`),
  UNIQUE KEY `uk_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_PrepaymentContractItems_contractNo` (`contractNo`),
  KEY `idx_PrepaymentContractItems_purchaseOrderItemId` (`purchaseOrderItemId`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预付款合同明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_prepaymentcontracts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_prepaymentcontracts` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `effectiveDate` date DEFAULT NULL COMMENT '生效日期',
  `totalAmount` decimal(18,4) DEFAULT NULL COMMENT '总金额',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentcontracts` (`contractNo`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预付款合同主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_prepaymentwriteoffadjustmentitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_prepaymentwriteoffadjustmentitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调整单号',
  `monthlyWriteOffId` varchar(96) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '月度核销记录ID',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '合同号',
  `contractLineId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '合同行ID',
  `writeOffMonth` date DEFAULT NULL COMMENT '核销月份',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `originalMonthlyAmount` decimal(18,4) DEFAULT NULL COMMENT '原月度金额',
  `adjustedMonthlyAmount` decimal(18,4) DEFAULT NULL COMMENT '调整后月度金额',
  `differenceAmount` decimal(18,4) DEFAULT NULL COMMENT '差额',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentwriteoffadjustmentitems` (`id`),
  KEY `idx_PrepaymentWriteOffAdjustmentItems_adjustmentNo` (`adjustmentNo`),
  KEY `idx_PrepaymentWriteOffAdjustmentItems_monthlyWriteOffId` (`monthlyWriteOffId`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预付款核销调整单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_prepaymentwriteoffadjustments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_prepaymentwriteoffadjustments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `adjustmentNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '调整单号',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '合同号',
  `itemCount` int NOT NULL DEFAULT '0' COMMENT '明细数量',
  `differenceTotal` decimal(18,4) DEFAULT NULL COMMENT '差额合计',
  `reason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '调整原因',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_prepaymentwriteoffadjustments` (`adjustmentNo`),
  KEY `idx_PrepaymentWriteOffAdjustments_status` (`status`),
  KEY `idx_PrepaymentWriteOffAdjustments_contractNo` (`contractNo`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预付款核销调整单主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_purchaseorderitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_purchaseorderitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `purchaseOrderId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单ID',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `requestItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '需求明细ID',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `taxExcludedUnitPrice` decimal(18,4) DEFAULT NULL COMMENT '未税单位价格',
  `taxSurcharge` decimal(18,4) NOT NULL DEFAULT '0.0000' COMMENT '税费附加',
  `unitPrice` decimal(18,4) DEFAULT NULL COMMENT '销售单价',
  `capexUnitPrice` decimal(18,4) DEFAULT NULL COMMENT 'CAPEX单位价格',
  `opexUnitPrice` decimal(18,4) DEFAULT NULL COMMENT 'OPEX单位价格',
  `hardwareCoefficient` decimal(18,6) DEFAULT NULL COMMENT '硬件系数',
  `softwareCoefficient` decimal(18,6) DEFAULT NULL COMMENT '软件系数',
  `totalCoefficient` decimal(18,6) DEFAULT NULL COMMENT '总系数',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_PurchaseOrderItems_requestItemId` (`requestItemId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorderitems` (`id`),
  KEY `idx_PurchaseOrderItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderItems_poNo` (`poNo`),
  KEY `idx_PurchaseOrderItems_requestType` (`requestType`)
) ENGINE=InnoDB AUTO_INCREMENT=281 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_purchaseorderplanitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_purchaseorderplanitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `purchaseOrderId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购订单ID',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `purchaseOrderItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单明细ID',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `sourcePlanId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源计划ID',
  `quoteReceivedAt` datetime DEFAULT NULL COMMENT '报价接收时间',
  `poIssuedAt` datetime DEFAULT NULL COMMENT 'PO下发时间',
  `receiptProofUploadedAt` datetime DEFAULT NULL COMMENT '收货凭证上传时间',
  `logisticsReceivedAt` datetime DEFAULT NULL COMMENT '物流接收时间',
  `ataAt` datetime DEFAULT NULL COMMENT 'ATA时间',
  `ata` datetime DEFAULT NULL COMMENT 'ATA日期',
  `supplierCpd` datetime DEFAULT NULL COMMENT '供应商CPD',
  `material` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物料',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `formFactor` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '规格形态',
  `unit` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '单位',
  `batch` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '批次',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '备注',
  `templateIdentifier` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '模板标识',
  `poStatus` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'PO状态',
  `rowId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '行ID',
  `headerId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '表头ID',
  `slMaterialCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'SL物料编码',
  `codeDescription` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '编码描述',
  `modelType` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '型号类型',
  `productName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '产品名称',
  `belongingModelName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '所属型号名称',
  `cabinetNodeCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '机柜节点编码',
  `atpOrder` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ATP订单号',
  `orderPriority` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '订单优先级',
  `datacenterOwner` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '数据中心负责人',
  `documentNoDescription` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '单据号说明',
  `computeMode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '算力模式',
  `productType` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '产品类型',
  `category` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '品类',
  `dataCenter` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '数据中心',
  `customizationFlag` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '定制标识',
  `supplyType` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '供应类型',
  `supplyInformation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '供应信息',
  `deliveryContact` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '交付联系人',
  `deliveryContactPhone` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '交付联系人电话',
  `computeSupplier` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '算力供应商',
  `country` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '国家或地区',
  `province` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '省份',
  `procurementFulfillmentManager` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '采购履约负责人',
  `supplierCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '供应商编码',
  `odmSupplierCodeV` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ODM供应商编码版本',
  `batchNo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '批次号',
  `city` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '城市',
  `deliveryAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '交付地址',
  `urgentOrder` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '是否紧急订单',
  `waybillNo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '运单号',
  `logisticsCurrentStatus` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '物流当前状态',
  `supplierUnsatisfiedExplanation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '供应商不满意说明',
  `firstDeliveryFailureReason` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '首次交付失败原因',
  `productionProgress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '生产进度',
  `purchaseOrderItemRelation` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '采购订单明细关联',
  `transportMode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '运输方式',
  `purchaseOrderNo` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '采购订单号',
  `fulfillmentUnit` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '履约单位',
  `odmSupplierCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ODM供应商编码',
  `odmSupplierName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ODM供应商名称',
  `tenantId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '租户ID',
  `template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '模板',
  `version` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '版本',
  `businessFlowId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '业务流程ID',
  `coreDocument` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '核心单据',
  `logisticsName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '物流名称',
  `processVersion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '流程版本',
  `upstreamDocumentItemId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '上游单据明细ID',
  `upstreamDocumentType` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '上游单据类型',
  `businessFlowInstanceId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '业务流程实例ID',
  `sn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SN码',
  `requestedQuantity` decimal(18,4) DEFAULT NULL COMMENT '需求数量',
  `shippedQuantity` decimal(18,4) DEFAULT NULL COMMENT '已发货数量',
  `pendingShipmentQuantity` decimal(18,4) DEFAULT NULL COMMENT '待发货数量',
  `shippedTotalQuantity` decimal(18,4) DEFAULT NULL COMMENT '已发货总数量',
  `totalModelQuantity` decimal(18,4) DEFAULT NULL COMMENT '型号总数量',
  `matchedQuantity` decimal(18,4) DEFAULT NULL COMMENT '已匹配数量',
  `price` decimal(18,4) DEFAULT NULL COMMENT '价格',
  `weight` decimal(18,4) DEFAULT NULL COMMENT '重量',
  `volume` decimal(18,4) DEFAULT NULL COMMENT '体积',
  `pieceCount` decimal(18,4) DEFAULT NULL COMMENT '件数',
  `originalRequestedQuantity` decimal(18,4) DEFAULT NULL COMMENT '原始需求数量',
  `wholeMachineSupplierPoActivatedAt` datetime DEFAULT NULL COMMENT '整机供应商PO启用时间',
  `wholeMachineSupplierPoConfirmedAt` datetime DEFAULT NULL COMMENT '整机供应商PO确认时间',
  `requestedAt` datetime DEFAULT NULL COMMENT '需求提交时间',
  `supplyDate` datetime DEFAULT NULL COMMENT '供应日期',
  `dssEpd` datetime DEFAULT NULL COMMENT 'DSS预计交付日期',
  `crd` datetime DEFAULT NULL COMMENT 'CRD日期',
  `rsd` datetime DEFAULT NULL COMMENT 'RSD日期',
  `rpd` datetime DEFAULT NULL COMMENT 'RPD日期',
  `cpd` datetime DEFAULT NULL COMMENT 'CPD日期',
  `esd` datetime DEFAULT NULL COMMENT 'ESD日期',
  `eta` datetime DEFAULT NULL COMMENT 'ETA日期',
  `logisticsArrivalTransferAt` datetime DEFAULT NULL COMMENT '物流到达交接时间',
  `firstDeliveryAt` datetime DEFAULT NULL COMMENT '首次交付时间',
  `apd` datetime DEFAULT NULL COMMENT 'APD日期',
  `asd` datetime DEFAULT NULL COMMENT 'ASD日期',
  `computeSupplierInstructionReceivedAt` datetime DEFAULT NULL COMMENT '算力供应商指令接收时间',
  `supplierFeedbackEsd` datetime DEFAULT NULL COMMENT '供应商反馈ESD',
  `supplierFeedbackEta` datetime DEFAULT NULL COMMENT '供应商反馈ETA',
  `apdAt` datetime DEFAULT NULL COMMENT 'APD时间',
  `asdAt` datetime DEFAULT NULL COMMENT 'ASD时间',
  `rsd2` datetime DEFAULT NULL COMMENT 'RSD2日期',
  `supplierPoActivatedAt` datetime DEFAULT NULL COMMENT '供应商PO启用时间',
  `timestamp` datetime DEFAULT NULL COMMENT '时间戳',
  `materialName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '物料名称',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorderplanitems` (`id`),
  KEY `idx_PurchaseOrderPlanItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderPlanItems_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_PurchaseOrderPlanItems_poNo` (`poNo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='要货计划子明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_purchaseorders`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_purchaseorders` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `purchaseOrderId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购订单ID',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `sourceRequestNos` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源需求单号列表',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '草稿' COMMENT '状态',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `usdRate` decimal(18,8) DEFAULT NULL COMMENT 'USD比率',
  `paymentDate` date DEFAULT NULL COMMENT '合同付款日期',
  `releasedAt` date DEFAULT NULL COMMENT '扩展扩展',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_PurchaseOrders_purchaseOrderId` (`purchaseOrderId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_purchaseorders` (`poNo`),
  KEY `idx_PurchaseOrders_requestNo` (`requestNo`),
  KEY `idx_PurchaseOrders_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=121 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='采购订单主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_purchaseordersnitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_purchaseordersnitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `purchaseOrderId` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '采购订单ID',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `purchaseOrderItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单明细ID',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `deviceVendor` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备供应商',
  `finalParentSn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终父项SN',
  `finalParentPn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终父项PN',
  `finalParentPnDescription` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终父项PN描述',
  `supplierFinalParentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商最终父项编码',
  `supplierParentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商父项编码',
  `supplierParentSn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商父项SN',
  `sn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'SN码',
  `fixedAssetCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '固定资产编码',
  `materialDescription` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '物料描述',
  `shippingBatch` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发货批次',
  `parentAssetNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '父项资产单号',
  `componentCategory` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '部件类别',
  `packingListNo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '装箱单号',
  `parentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '父项编码',
  `finalParentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最终父项编码',
  `supplierChildComponentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商子项部件编码',
  `customerChildComponentCode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户子项部件编码',
  `supplierChildComponentDescription` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商子项部件描述',
  `childComponentOriginalPn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '子项部件原始PN',
  `childComponentOriginalSn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '子项部件原始SN',
  `rackUnit` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '机架单位',
  `site` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '站点',
  `contactPhone` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '联系电话',
  `level` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '层级',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `childSparePartCode` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '子项备件编码',
  `childTopSn` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '子项顶层SN',
  `customerChildComponentOriginalSn` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '客户子项部件原始SN',
  `childComponentDescription` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '子项部件描述',
  `rowId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '行ID',
  `tenantId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '租户ID',
  `template` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '模板',
  `version` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '版本',
  `businessFlowId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '业务流程ID',
  `coreDocument` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '核心单据',
  `processName` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '流程名称',
  `processVersion` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '流程版本',
  `upstreamDocumentId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '上游单据ID',
  `upstreamDocumentItemId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '上游单据明细ID',
  `upstreamDocumentType` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '上游单据类型',
  `businessFlowInstanceId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '业务流程实例ID',
  `sourceId` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '来源ID',
  `timestamp` datetime DEFAULT NULL COMMENT '时间戳',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_purchaseordersnitems` (`id`),
  KEY `idx_PurchaseOrderSnItems_purchaseOrderId` (`purchaseOrderId`),
  KEY `idx_PurchaseOrderSnItems_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_PurchaseOrderSnItems_poNo` (`poNo`),
  KEY `idx_PurchaseOrderSnItems_sn` (`sn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='要货计划SN明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_requestitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_requestitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '需求单号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备编码',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `requestedAt` date DEFAULT NULL COMMENT '需求提交时间',
  `quantity` int NOT NULL DEFAULT '0' COMMENT '数量',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_requestitems` (`id`),
  KEY `idx_RequestItems_requestNo` (`requestNo`),
  KEY `idx_RequestItems_requestNo_deviceCode` (`requestNo`,`deviceCode`),
  KEY `idx_RequestItems_deviceCode` (`deviceCode`),
  KEY `idx_RequestItems_supplierId` (`supplierId`),
  KEY `idx_RequestItems_undertakingUnitId` (`undertakingUnitId`),
  KEY `idx_RequestItems_customerId` (`customerId`),
  KEY `idx_RequestItems_requestType` (`requestType`),
  CONSTRAINT `chk_RequestItems_quantity_nonnegative` CHECK ((`quantity` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=281 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户需求明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_requests`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_requests` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '需求单号',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `contractNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '合同号',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '状态',
  `plannedDeliveryDate` date DEFAULT NULL COMMENT '计划交付日期',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `createdByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人ID',
  `createdByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '创建人',
  `updatedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人ID',
  `updatedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '更新人',
  `confirmedByUserId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人ID',
  `confirmedByName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '确认人',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_requests` (`requestNo`),
  KEY `idx_Requests_contractNo` (`contractNo`),
  KEY `idx_Requests_countryCode` (`countryCode`)
) ENGINE=InnoDB AUTO_INCREMENT=225 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户需求单主表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_servicefeesnapshotitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_servicefeesnapshotitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(160) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `writeOffMonth` date NOT NULL COMMENT '核销月份',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `requestNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求单号',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户PO号',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `requestType` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '需求类型',
  `modelCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `customerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户ID',
  `quantity` int DEFAULT NULL COMMENT '数量',
  `currency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '币种',
  `billingCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '账单币种',
  `prepaymentCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '预付款币种',
  `lineType` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '明细类型',
  `billingAmount` decimal(18,4) DEFAULT NULL COMMENT '账单金额',
  `prepaymentAmount` decimal(18,4) DEFAULT NULL COMMENT '预付款金额',
  `serviceFeeAmount` decimal(18,4) DEFAULT NULL COMMENT '服务费金额',
  `serviceFeeAmountExcludingTax` decimal(18,4) DEFAULT NULL COMMENT '服务费未税金额',
  `billingSourceIds` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '账单来源ID',
  `prepaymentSourceIds` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '预付款来源ID',
  `prepaymentContractNos` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '预付款合同号',
  `sourceNote` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '来源说明',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_servicefeesnapshotitems` (`id`),
  KEY `idx_ServiceFeeSnapshotItems_snapshotNo` (`snapshotNo`),
  KEY `idx_ServiceFeeSnapshotItems_writeOffMonth` (`writeOffMonth`),
  KEY `idx_ServiceFeeSnapshotItems_deviceCode` (`deviceCode`)
) ENGINE=InnoDB AUTO_INCREMENT=99 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务费对账单明细';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_servicefeesnapshots`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_servicefeesnapshots` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `snapshotNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照单号',
  `status` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '未确认' COMMENT '状态',
  `writeOffMonth` date DEFAULT NULL COMMENT '核销月份',
  `startMonth` date DEFAULT NULL COMMENT '开始月份',
  `endMonth` date DEFAULT NULL COMMENT '结束月份',
  `countryCode` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '国家代码',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `keyword` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关键词',
  `billingTotal` decimal(18,4) DEFAULT NULL COMMENT '账单总',
  `prepaymentTotal` decimal(18,4) DEFAULT NULL COMMENT '预付款总',
  `serviceFeeTotal` decimal(18,4) DEFAULT NULL COMMENT '服务费合计',
  `serviceFeeTotalExcludingTax` decimal(18,4) DEFAULT NULL COMMENT '服务费未税合计',
  `vatRate` decimal(10,6) DEFAULT NULL COMMENT '增值税比率',
  `instanceServiceFeeTotal` decimal(18,4) DEFAULT NULL COMMENT '实例类服务费合计',
  `feeServiceFeeTotal` decimal(18,4) DEFAULT NULL COMMENT '费用类服务费合计',
  `repaymentStatus` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '未回款' COMMENT '回款状态',
  `receivingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '收款单位ID',
  `payerCustomerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '付款客户ID',
  `repaymentCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '回款币种',
  `repaymentAmount` decimal(18,4) DEFAULT NULL COMMENT '回款金额',
  `repaymentAmountExcludingTax` decimal(18,4) DEFAULT NULL COMMENT '回款未税金额',
  `repaymentVatRate` decimal(10,6) DEFAULT NULL COMMENT '回款增值税率',
  `repaymentDate` date DEFAULT NULL COMMENT '回款日期',
  `repaymentUpdatedAt` datetime DEFAULT NULL COMMENT '回款更新时间',
  `invoiceNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票号',
  `invoiceCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票币种',
  `invoiceReceivingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票收款单位ID',
  `invoicePayerCustomerId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '客户开票付款客户ID',
  `invoiceAmountExcludingTax` decimal(18,4) DEFAULT NULL COMMENT '发票未税金额',
  `invoiceVatRate` decimal(10,6) DEFAULT NULL COMMENT '发票增值税比率',
  `invoiceAmountIncludingTax` decimal(18,4) DEFAULT NULL COMMENT '发票含税金额',
  `receivableDate` date DEFAULT NULL COMMENT '应收日期',
  `invoiceStatus` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '未开票' COMMENT '开票状态',
  `invoiceOriginalName` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票原名称',
  `invoiceStoredName` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票存储名称',
  `invoiceFilePath` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票文件路径',
  `invoiceMimeType` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票文件类型',
  `invoiceFileSize` bigint DEFAULT NULL COMMENT '发票文件大小',
  `invoiceUploadedBy` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '发票上传人',
  `invoiceUploadedAt` datetime DEFAULT NULL COMMENT '发票上传时间',
  `confirmedAt` datetime DEFAULT NULL COMMENT '确认时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_servicefeesnapshots` (`snapshotNo`),
  KEY `idx_ServiceFeeSnapshots_writeOffMonth` (`writeOffMonth`),
  KEY `idx_ServiceFeeSnapshots_months` (`startMonth`,`endMonth`),
  KEY `idx_ServiceFeeSnapshots_countryCode` (`countryCode`),
  KEY `idx_ServiceFeeSnapshots_invoiceStatus` (`invoiceStatus`),
  KEY `idx_ServiceFeeSnapshots_repaymentStatus` (`repaymentStatus`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务费对账单';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_shipments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_shipments` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `shipmentId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物流记录ID',
  `poNo` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '客户PO号',
  `batchName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '批次名称',
  `purchaseOrderItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '采购订单明细ID',
  `deviceCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备编码',
  `nameEn` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '英文名称',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '供应商ID',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '承接单位ID',
  `dcCode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '数据中心编码',
  `dcNameZh` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '数据中心中文名称',
  `destinationLocationId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目的地ID',
  `recipientContactId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '收件联系人ID',
  `snapshotDestinationAddress` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照目的地地址',
  `snapshotRecipientName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照收件人姓名',
  `snapshotRecipientPhone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '快照收件人电话',
  `transportMode` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '运输方式',
  `isReceived` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已收货',
  `crd` date DEFAULT NULL COMMENT 'CRD日期',
  `apdAt` date DEFAULT NULL COMMENT 'APD时间',
  `pickupAt` date DEFAULT NULL COMMENT '提货时间',
  `departedAt` date DEFAULT NULL COMMENT '发出时间',
  `arrivedAt` date DEFAULT NULL COMMENT '到达时间',
  `customsClearedAt` date DEFAULT NULL COMMENT '清关完成时间',
  `deliveredAt` date DEFAULT NULL COMMENT '交付完成时间',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_shipments` (`shipmentId`),
  KEY `idx_Shipments_poNo` (`poNo`),
  KEY `idx_Shipments_batchName` (`batchName`),
  KEY `idx_Shipments_purchaseOrderItemId` (`purchaseOrderItemId`),
  KEY `idx_Shipments_dcCode` (`dcCode`),
  KEY `idx_Shipments_destinationLocationId` (`destinationLocationId`),
  KEY `idx_Shipments_recipientContactId` (`recipientContactId`)
) ENGINE=InnoDB AUTO_INCREMENT=282 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物流记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_suppliers`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_suppliers` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `supplierId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商ID',
  `supplierCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '供应商编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_Suppliers_supplierCode` (`supplierCode`),
  UNIQUE KEY `uk_internal_legacy_merge_power_suppliers` (`supplierId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力供应商';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_undertakingunits`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_undertakingunits` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `undertakingUnitId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位ID',
  `undertakingUnitCode` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '承接单位编码',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '名称',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_UndertakingUnits_code` (`undertakingUnitCode`),
  UNIQUE KEY `uk_internal_legacy_merge_power_undertakingunits` (`undertakingUnitId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力承接单位';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_userpreferences`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_userpreferences` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `userId` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户ID',
  `preferenceKey` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '偏好设置项',
  `preferenceValue` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '偏好设置值',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_userpreferences` (`userId`,`preferenceKey`),
  KEY `idx_UserPreferences_updatedAt` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='算力系统用户偏好设置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `merge_power_writeoffitems`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merge_power_writeoffitems` (
  `internalId` int unsigned NOT NULL AUTO_INCREMENT COMMENT '数据库内部自增主键',
  `id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记录ID',
  `requestItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '需求明细ID',
  `prepaymentContractItemId` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '预付款合同明细ID',
  `prepaymentAmountUSD` decimal(18,4) DEFAULT NULL COMMENT '预付款金额USD',
  `writeOffCurrency` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '核销币种',
  `writeOffRate` decimal(18,8) DEFAULT NULL COMMENT '核销汇率',
  `startMonth` date DEFAULT NULL COMMENT '开始月份',
  `totalMonths` int DEFAULT NULL COMMENT '总月数',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`internalId`),
  UNIQUE KEY `uk_internal_legacy_merge_power_writeoffitems` (`id`),
  KEY `idx_WriteOffItems_requestItemId` (`requestItemId`),
  KEY `idx_WriteOffItems_prepaymentContractItemId` (`prepaymentContractItemId`),
  CONSTRAINT `chk_WriteOffItems_totalMonths_positive` CHECK (((`totalMonths` is null) or (`totalMonths` > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='核销明细';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-02 14:09:01
