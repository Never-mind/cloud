# 数据库 ER 图

说明：以下图基于当前仓库里的 `schema.sql` 整理。由于目前 MySQL 表里大多没有显式外键约束，图中的关系按字段命名和业务逻辑推导。

```mermaid
erDiagram
    POWER_COUNTRIES {
        varchar code PK
        varchar nameZh
        varchar nameEn
        varchar nameLocal
        decimal vatRate
    }

    POWER_DELIVERYLOCATIONS {
        varchar locationId PK
        varchar countryCode FK
        varchar locationType
        varchar nameZh
        varchar nameEn
        text fullAddress
    }

    POWER_DELIVERYCONTACTS {
        varchar contactId PK
        varchar locationId FK
        varchar name
        varchar phone
        varchar email
    }

    POWER_DATACENTERS {
        varchar dcCode PK
        varchar locationId FK
        varchar nameZh
        varchar nameEn
    }

    POWER_INSTANCEMODELS {
        varchar deviceCode PK
        varchar modelCode UK
        varchar xxllCode
        varchar nameZh
        varchar nameEn
    }

    POWER_SUPPLIERS {
        varchar supplierId PK
        varchar supplierCode UK
        varchar name
    }

    POWER_UNDERTAKINGUNITS {
        varchar undertakingUnitId PK
        varchar undertakingUnitCode UK
        varchar name
    }

    POWER_INSTANCECONTRACTS {
        varchar id PK
        varchar contractNo UK
        varchar countryCode FK
        varchar deviceCode FK
        varchar modelCode
        varchar instanceModelEn
        varchar currency
        decimal first24MonthPriceUSD
        decimal next36MonthPriceUSD
        date dateSigned
        varchar status
    }

    POWER_CONTRACTITEMS {
        varchar id PK
        varchar contractNo FK
        varchar deviceCode FK
        decimal basePrice
        varchar currency
    }

    POWER_REQUESTS {
        varchar requestNo PK
        varchar countryCode FK
        varchar contractNo FK
        varchar batchName
        varchar requestType
        varchar status
        date plannedDeliveryDate
    }

    POWER_REQUESTITEMS {
        varchar id PK
        varchar requestNo FK
        varchar deviceCode FK
        varchar supplierId FK
        varchar undertakingUnitId FK
        date requestedAt
        int quantity
    }

    POWER_PURCHASEORDERS {
        varchar purchaseOrderId UK
        varchar poNo PK
        varchar requestNo FK
        text sourceRequestNos
        varchar status
        varchar currency
        decimal usdRate
        date paymentDate
        date releasedAt
    }

    POWER_PURCHASEORDERITEMS {
        varchar id PK
        varchar purchaseOrderId FK
        varchar poNo FK
        varchar requestNo FK
        varchar requestItemId FK
        decimal taxExcludedUnitPrice
        decimal taxSurcharge
        decimal unitPrice
        decimal hardwareCoefficient
        decimal softwareCoefficient
        decimal totalCoefficient
    }

    POWER_PURCHASEORDERSNITEMS {
        varchar id PK
        varchar purchaseOrderId FK
        varchar poNo FK
        varchar purchaseOrderItemId FK
        varchar requestNo FK
        varchar sn
        varchar shippingBatch
        varchar site
        varchar contactPhone
        varchar level
    }

    POWER_PURCHASEORDERPLANITEMS {
        varchar id PK
        varchar purchaseOrderId FK
        varchar poNo FK
        varchar purchaseOrderItemId FK
        varchar requestNo FK
        varchar sourcePlanId
        date quoteReceivedAt
        date poIssuedAt
        date receiptProofUploadedAt
        date logisticsReceivedAt
        date ataAt
    }

    POWER_PREPAYMENTCONTRACTS {
        varchar contractNo PK
        varchar status
        varchar currency
        date effectiveDate
        decimal totalAmount
        datetime confirmedAt
    }

    POWER_PREPAYMENTCONTRACTITEMS {
        varchar id PK
        varchar contractNo FK
        varchar lineType
        varchar purchaseOrderItemId FK
        varchar requestItemId FK
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar actualCurrency
        decimal actualUnitPrice
        decimal actualTotalAmount
        varchar contractCurrency
        decimal contractUnitPrice
        decimal contractTotalAmount
        date writeOffStartMonth
        varchar feeName
        decimal prepaymentAmount
        varchar currency
    }

    POWER_MONTHLYPREPAYMENTWRITEOFFS {
        varchar id PK
        varchar contractNo FK
        varchar contractLineId FK
        date writeOffMonth
        int monthIndex
        int totalMonths
        varchar currency
        decimal originalAmount
        decimal monthlyAmount
        varchar lineType
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar sourceType
        varchar adjustmentNo
    }

    POWER_PREPAYMENTWRITEOFFADJUSTMENTS {
        varchar adjustmentNo PK
        varchar status
        varchar countryCode FK
        varchar batchName
        varchar contractNo FK
        int itemCount
        decimal differenceTotal
        text reason
        datetime confirmedAt
    }

    POWER_PREPAYMENTWRITEOFFADJUSTMENTITEMS {
        varchar id PK
        varchar adjustmentNo FK
        varchar monthlyWriteOffId FK
        varchar contractNo FK
        varchar contractLineId FK
        date writeOffMonth
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        int quantity
        varchar currency
        decimal originalMonthlyAmount
        decimal adjustedMonthlyAmount
        decimal differenceAmount
    }

    POWER_BILLINGINSTANCELEDGERS {
        varchar ledgerId PK
        varchar purchaseOrderItemId FK
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar actualCurrency
        decimal actualUnitPrice
        decimal taxExcludedUnitPrice
        decimal taxSurcharge
        decimal vatRate
        decimal selfCalculatedUnitPrice
        varchar instanceContractNo FK
        varchar contractCurrency
        decimal first24MonthPrice
        decimal next36MonthPrice
        decimal differenceUnitPrice
        decimal differenceTotalPrice
        date startMonth
        varchar status
    }

    POWER_MONTHLYBILLINGWRITEOFFS {
        varchar id PK
        varchar ledgerId FK
        date writeOffMonth
        int monthIndex
        varchar stage
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar instanceContractNo FK
        varchar currency
        decimal monthlyAmount
        decimal monthlyTotalAmount
        decimal selfCalculatedUnitPrice
        decimal differenceUnitPrice
        decimal differenceTotalPrice
        varchar sourceType
        varchar adjustmentNo
    }

    POWER_BILLINGADJUSTMENTS {
        varchar adjustmentNo PK
        varchar instanceContractNo FK
        varchar status
        int itemCount
        varchar countryCode FK
        varchar batchName
        varchar deviceCode
        varchar currency
        date effectiveMonth
        decimal adjustedFirst24MonthPrice
        decimal adjustedNext36MonthPrice
        text reason
        datetime confirmedAt
    }

    POWER_BILLINGADJUSTMENTITEMS {
        varchar id PK
        varchar adjustmentNo FK
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        int quantity
        varchar currency
        date effectiveMonth
        decimal adjustedFirst24MonthPrice
        decimal adjustedNext36MonthPrice
    }

    POWER_BILLINGSTATEMENTSNAPSHOTS {
        varchar snapshotNo PK
        varchar countryCode FK
        date startDate
        date endDate
        varchar currencySummary
        decimal totalQuantity
        decimal totalAmount
        int itemCount
    }

    POWER_BILLINGSTATEMENTSNAPSHOTITEMS {
        varchar id PK
        varchar snapshotNo FK
        varchar countryCode FK
        varchar currency
        varchar instanceContractNo FK
        varchar productType
        decimal unitPriceVatExcluded
        decimal vatRate
        decimal unitPriceVatIncluded
        decimal quantity
        decimal amount
        date startTime
        date endTime
    }

    POWER_SERVICEFEESNAPSHOTS {
        varchar snapshotNo PK
        varchar status
        date startMonth
        date endMonth
        varchar countryCode FK
        varchar batchName
        varchar keyword
        decimal billingTotal
        decimal prepaymentTotal
        decimal serviceFeeTotal
        decimal instanceServiceFeeTotal
        decimal feeServiceFeeTotal
        datetime confirmedAt
    }

    POWER_SERVICEFEESNAPSHOTITEMS {
        varchar id PK
        varchar snapshotNo FK
        date writeOffMonth
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar currency
        varchar billingCurrency
        varchar prepaymentCurrency
        varchar lineType
        decimal billingAmount
        decimal prepaymentAmount
        decimal serviceFeeAmount
        text billingSourceIds
        text prepaymentSourceIds
        text prepaymentContractNos
    }

    POWER_WRITEOFFITEMS {
        varchar id PK
        varchar requestItemId FK
        varchar prepaymentContractItemId FK
        decimal prepaymentAmountUSD
        varchar writeOffCurrency
        decimal writeOffRate
        date startMonth
        int totalMonths
    }

    POWER_SHIPMENTS {
        varchar shipmentId PK
        varchar poNo FK
        varchar batchName
        varchar purchaseOrderItemId FK
        varchar deviceCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        varchar dcCode FK
        varchar destinationLocationId FK
        varchar recipientContactId FK
        text snapshotDestinationAddress
        varchar snapshotRecipientName
        varchar snapshotRecipientPhone
        varchar transportMode
        boolean isReceived
        date crd
        date apdAt
        date pickupAt
        date departedAt
        date arrivedAt
        date customsClearedAt
        date deliveredAt
    }

    POWER_DOCUMENTFOLDERS {
        varchar folderId PK
        varchar parentId FK
        varchar name
        int sortOrder
        datetime createdAt
        datetime updatedAt
    }

    POWER_DOCUMENTFILES {
        varchar fileId PK
        varchar folderId FK
        varchar originalName
        varchar storedName
        varchar filePath
        varchar mimeType
        varchar extension
        varchar category
        bigint fileSize
        varchar uploadedBy
    }

    POWER_IMPORTJOBS {
        varchar jobId PK
        varchar targetKey
        varchar targetTitle
        varchar fileName
        varchar status
        int totalRows
        int successRows
        int failedRows
        int masterCount
        int detailCount
        longtext previewJson
        longtext reportJson
        datetime confirmedAt
    }

    POWER_APPUSERS {
        varchar userId PK
        varchar email UK
        varchar passwordHash
        varchar passwordSalt
        varchar displayName
        varchar role
        varchar status
        datetime lastLoginAt
    }

    POWER_USERPREFERENCES {
        varchar userId PK
        varchar preferenceKey PK
        longtext preferenceValue
        datetime updatedAt
    }

    POWER_INTERNALSERVICELEDGERS {
        varchar ledgerId PK
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar currency
        decimal vatRate
        decimal procurementTaxExcludedUnitPrice
        decimal procurementTaxSurcharge
        decimal contractRevenueIncludingTax
        decimal contractRevenueExcludingTax
        decimal procurementCost
        decimal internalServiceFeeTotal
        decimal archivedAmount
        decimal manualAmount
        decimal remainingAmount
        decimal unallocatedAmount
        date startMonth
        varchar status
    }

    POWER_MONTHLYINTERNALSERVICEFEES {
        varchar id PK
        varchar ledgerId FK
        date writeOffMonth
        int monthIndex
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar modelCode
        varchar nameEn
        varchar supplierId FK
        varchar undertakingUnitId FK
        int quantity
        varchar currency
        decimal internalServiceFeeAmount
        varchar sourceType
        varchar adjustmentNo
        boolean archived
        varchar archiveSnapshotNo
        datetime archivedAt
    }

    POWER_INTERNALSERVICEFEEADJUSTMENTS {
        varchar adjustmentNo PK
        varchar ledgerId FK
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar supplierId FK
        varchar undertakingUnitId FK
        date startMonth
        date endMonth
        decimal monthlyAmount
        text reason
        varchar status
        datetime confirmedAt
    }

    POWER_INTERNALSERVICEFEESNAPSHOTS {
        varchar snapshotNo PK
        date archiveMonth
        varchar countryCode FK
        int itemCount
        decimal totalAmount
        datetime confirmedAt
    }

    POWER_INTERNALSERVICEFEESNAPSHOTITEMS {
        varchar id PK
        varchar snapshotNo FK
        varchar monthlyFeeId FK
        varchar ledgerId FK
        date writeOffMonth
        varchar countryCode FK
        varchar batchName
        varchar requestNo
        varchar poNo
        varchar deviceCode
        varchar supplierId FK
        varchar undertakingUnitId FK
        varchar currency
        decimal internalServiceFeeAmount
        varchar sourceType
        varchar adjustmentNo
    }

    POWER_COUNTRIES ||--o{ POWER_DELIVERYLOCATIONS : located_in
    POWER_DELIVERYLOCATIONS ||--o{ POWER_DELIVERYCONTACTS : has_contacts
    POWER_DELIVERYLOCATIONS ||--|| POWER_DATACENTERS : binds

    POWER_COUNTRIES ||--o{ POWER_INSTANCECONTRACTS : contract_country
    POWER_INSTANCECONTRACTS ||--o{ POWER_CONTRACTITEMS : contains
    POWER_INSTANCEMODELS ||--o{ POWER_CONTRACTITEMS : priced_for

    POWER_INSTANCECONTRACTS ||--o{ POWER_REQUESTS : used_by
    POWER_REQUESTS ||--o{ POWER_REQUESTITEMS : contains
    POWER_INSTANCEMODELS ||--o{ POWER_REQUESTITEMS : requested_as
    POWER_SUPPLIERS ||--o{ POWER_REQUESTITEMS : supplies
    POWER_UNDERTAKINGUNITS ||--o{ POWER_REQUESTITEMS : undertakes

    POWER_REQUESTITEMS ||--o| POWER_PURCHASEORDERITEMS : maps_to
    POWER_PURCHASEORDERS ||--o{ POWER_PURCHASEORDERITEMS : contains
    POWER_PURCHASEORDERS ||--o{ POWER_PURCHASEORDERSNITEMS : contains
    POWER_PURCHASEORDERITEMS ||--o{ POWER_PURCHASEORDERSNITEMS : sn_lines
    POWER_PURCHASEORDERS ||--o{ POWER_PURCHASEORDERPLANITEMS : contains
    POWER_PURCHASEORDERITEMS ||--o{ POWER_PURCHASEORDERPLANITEMS : plan_lines

    POWER_PURCHASEORDERITEMS ||--o{ POWER_BILLINGINSTANCELEDGERS : generates
    POWER_BILLINGINSTANCELEDGERS ||--o{ POWER_MONTHLYBILLINGWRITEOFFS : splits_into
    POWER_BILLINGINSTANCELEDGERS ||--o{ POWER_BILLINGADJUSTMENTS : adjusted_by
    POWER_BILLINGADJUSTMENTS ||--o{ POWER_BILLINGADJUSTMENTITEMS : contains
    POWER_BILLINGINSTANCELEDGERS ||--o{ POWER_BILLINGSTATEMENTSNAPSHOTS : statement_source
    POWER_BILLINGSTATEMENTSNAPSHOTS ||--o{ POWER_BILLINGSTATEMENTSNAPSHOTITEMS : contains

    POWER_PREPAYMENTCONTRACTS ||--o{ POWER_PREPAYMENTCONTRACTITEMS : contains
    POWER_PREPAYMENTCONTRACTITEMS ||--o{ POWER_MONTHLYPREPAYMENTWRITEOFFS : generates
    POWER_PREPAYMENTCONTRACTS ||--o{ POWER_PREPAYMENTWRITEOFFADJUSTMENTS : adjusted_by
    POWER_PREPAYMENTWRITEOFFADJUSTMENTS ||--o{ POWER_PREPAYMENTWRITEOFFADJUSTMENTITEMS : contains
    POWER_MONTHLYPREPAYMENTWRITEOFFS ||--o{ POWER_PREPAYMENTWRITEOFFADJUSTMENTITEMS : adjusted_from

    POWER_BILLINGINSTANCELEDGERS ||--o{ POWER_SERVICEFEESNAPSHOTITEMS : billing_source
    POWER_PREPAYMENTCONTRACTITEMS ||--o{ POWER_SERVICEFEESNAPSHOTITEMS : prepayment_source
    POWER_SERVICEFEESNAPSHOTS ||--o{ POWER_SERVICEFEESNAPSHOTITEMS : contains

    POWER_REQUESTITEMS ||--o{ POWER_WRITEOFFITEMS : writeoff_target
    POWER_PREPAYMENTCONTRACTITEMS ||--o{ POWER_WRITEOFFITEMS : writeoff_source

    POWER_PURCHASEORDERS ||--o{ POWER_SHIPMENTS : ships_in
    POWER_PURCHASEORDERITEMS ||--o{ POWER_SHIPMENTS : shipment_item
    POWER_DELIVERYLOCATIONS ||--o{ POWER_SHIPMENTS : destination
    POWER_DELIVERYCONTACTS ||--o{ POWER_SHIPMENTS : recipient
    POWER_DATACENTERS ||--o{ POWER_SHIPMENTS : datacenter

    POWER_DOCUMENTFOLDERS ||--o{ POWER_DOCUMENTFILES : contains
    POWER_DOCUMENTFOLDERS ||--o{ POWER_DOCUMENTFOLDERS : parent_child
    POWER_APPUSERS ||--o{ POWER_USERPREFERENCES : has_preferences

    POWER_COUNTRIES ||--o{ POWER_INTERNALSERVICELEDGERS : country_base
    POWER_UNDERTAKINGUNITS ||--o{ POWER_INTERNALSERVICELEDGERS : undertakes
    POWER_SUPPLIERS ||--o{ POWER_INTERNALSERVICELEDGERS : supplies
    POWER_INTERNALSERVICELEDGERS ||--o{ POWER_MONTHLYINTERNALSERVICEFEES : generates
    POWER_INTERNALSERVICELEDGERS ||--o{ POWER_INTERNALSERVICEFEEADJUSTMENTS : adjusted_by
    POWER_INTERNALSERVICEFEEADJUSTMENTS ||--o{ POWER_MONTHLYINTERNALSERVICEFEES : applies_to
    POWER_INTERNALSERVICEFEESNAPSHOTS ||--o{ POWER_INTERNALSERVICEFEESNAPSHOTITEMS : contains
    POWER_MONTHLYINTERNALSERVICEFEES ||--o{ POWER_INTERNALSERVICEFEESNAPSHOTITEMS : archived_into
```

如果你要，我还能继续把这张总图拆成「基础信息 / 需求采购物流 / 财务 / 文档与导入」四张子图，方便单独查看。
