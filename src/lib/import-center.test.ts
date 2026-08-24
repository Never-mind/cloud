import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  getImportTemplateColumns,
  isImportTemplateNoteRow,
  listImportTargets,
} from "./import-center";
import { normalizeEntityImportRow } from "./entity-import";
import { normalizeImportJobPagination } from "./import-center-service";
import type { EntityConfig } from "./modules";

describe("import center workflow", () => {
  it("normalizes import history pagination parameters", () => {
    expect(normalizeImportJobPagination(new URLSearchParams("page=3&pageSize=50"))).toEqual({
      page: 3,
      pageSize: 50,
      offset: 100,
    });
    expect(normalizeImportJobPagination(new URLSearchParams("page=0&pageSize=999"))).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
  });

  it("lists reusable import targets with template columns", () => {
    expect(listImportTargets().map((target) => target.key)).toEqual([
      "request-orders",
      "purchase-orders",
      "instance-contracts",
      "billing-ledgers",
      "prepayment-contracts",
    ]);

    expect(getImportTemplateColumns("request-orders").map((column) => column.key)).toEqual([
      "requestNo",
      "countryCode",
      "contractNo",
      "batchName",
      "requestType",
      "status",
      "plannedDeliveryDate",
      "requestedAt",
      "deviceCode",
      "supplierId",
      "undertakingUnitId",
      "customerId",
      "quantity",
    ]);
    expect(getImportTemplateColumns("purchase-orders").map((column) => column.key)).toContain("deviceCode");
    expect(getImportTemplateColumns("billing-ledgers").find((column) => column.key === "ledgerId")?.required).toBeFalsy();
    expect(getImportTemplateColumns("billing-ledgers").find((column) => column.key === "purchaseOrderItemId")?.required).toBeFalsy();
  });

  it("builds billing ledger initialization rows", () => {
    const preview = buildImportPreview("billing-ledgers", [
      {
        ledgerId: "BIL-INIT-001",
        purchaseOrderItemId: "POI-001",
        countryCode: "BR",
        batchName: "BR-1",
        requestNo: "REQ-001",
        poNo: "PO-001",
        deviceCode: "DEV-A",
        modelCode: "M-A",
        nameEn: "Instance A",
        quantity: 2,
        actualCurrency: "USD",
        actualUnitPrice: 10,
        instanceContractNo: "IC-001",
        contractCurrency: "USD",
        first24MonthPrice: 500,
        next36MonthPrice: 5,
        startMonth: "2026-07-15",
        status: "",
      },
    ], {
      instanceContracts: [{ contractNo: "IC-001", countryCode: "BR", deviceCode: "DEV-A", currency: "USD", first24MonthPriceUSD: 500, next36MonthPriceUSD: 5 }],
    });

    expect(preview.report).toMatchObject({ total: 1, success: 1, failed: [] });
    expect(preview.summary).toMatchObject({ masterCount: 1, detailCount: 60 });
    expect(preview.operations.billingLedgers[0]).toMatchObject({
      ledgerId: "BIL-INIT-001",
      purchaseOrderItemId: "POI-001",
      startMonth: "2026-07-01",
    });
    expect(preview.operations.monthlyBillingWriteOffs).toHaveLength(60);
  });

  it("derives a missing purchase tax surcharge from the included and excluded prices", () => {
    const preview = buildImportPreview(
      "purchase-orders",
      [{ poNo: "PO-TAX", requestNo: "REQ-TAX", requestItemId: "RI-TAX", currency: "USD", taxExcludedUnitPrice: 100, taxSurcharge: 0, unitPrice: 116 }],
    );

    expect(preview.operations.purchaseOrderItems[0]).toMatchObject({
      taxExcludedUnitPrice: 100,
      taxSurcharge: 16,
      unitPrice: 116,
    });
  });

  it("fills instance contract model fields from the device code", () => {
    const preview = buildImportPreview(
      "instance-contracts",
      [
        {
          contractNo: "IC-IMPORT-001",
          countryCode: "BR",
          deviceCode: "DEV-A",
          currency: "USD",
          first24MonthPriceUSD: 500,
          next36MonthPriceUSD: 5,
        },
      ],
      { instanceModels: [{ deviceCode: "DEV-A", modelCode: "M-A", nameEn: "Compute Enhanced" }] },
    );

    expect(preview.report.failed).toEqual([]);
    expect(preview.operations.instanceContracts[0]).toMatchObject({
      deviceCode: "DEV-A",
      modelCode: "M-A",
      instanceModelEn: "Compute Enhanced",
    });
  });

  it("auto-generates billing ledger id and resolves purchase item by request number, PO number, and product code", () => {
    const preview = buildImportPreview(
      "billing-ledgers",
      [
        {
          ledgerId: "",
          purchaseOrderItemId: "",
          requestNo: "REQ-001",
          poNo: "PO-001",
          deviceCode: "DEV-A",
          instanceContractNo: "IC-001",
        contractCurrency: "CNY",
        first24MonthPrice: 1,
        next36MonthPrice: 2,
          startMonth: "2026-07-15",
        },
      ],
      {
        instanceContracts: [{ contractNo: "IC-001", countryCode: "BR", deviceCode: "DEV-A", currency: "USD", first24MonthPriceUSD: 500, next36MonthPriceUSD: 5 }],
        billingPurchaseLines: [
          {
            purchaseOrderItemId: "POI-001",
            countryCode: "BR",
            batchName: "BR-1",
            requestNo: "REQ-001",
            poNo: "PO-001",
            deviceCode: "DEV-A",
            modelCode: "M-A",
            nameEn: "Instance A",
            quantity: 2,
            actualCurrency: "USD",
            actualUnitPrice: 10,
          },
        ],
      },
    );

    expect(preview.report).toMatchObject({ total: 1, success: 1, failed: [] });
    expect(preview.operations.billingLedgers[0]).toMatchObject({
      ledgerId: "BIL-POI-001",
      purchaseOrderItemId: "POI-001",
      countryCode: "BR",
      batchName: "BR-1",
      requestNo: "REQ-001",
      poNo: "PO-001",
      deviceCode: "DEV-A",
      modelCode: "M-A",
      nameEn: "Instance A",
      quantity: 2,
      actualCurrency: "USD",
      actualUnitPrice: 10,
      contractCurrency: "USD",
      first24MonthPrice: 500,
      next36MonthPrice: 5,
    });
    expect(preview.operations.monthlyBillingWriteOffs).toHaveLength(60);
  });

  it("builds prepayment contract initialization rows", () => {
    const preview = buildImportPreview("prepayment-contracts", [
      {
        contractNo: "PP-INIT-001",
        status: "已确认",
        currency: "USD",
        effectiveDate: "2026-07-01",
        lineType: "instance",
        purchaseOrderItemId: "POI-001",
        requestItemId: "RI-001",
        countryCode: "BR",
        batchName: "BR-1",
        requestNo: "REQ-001",
        poNo: "PO-001",
        deviceCode: "DEV-A",
        modelCode: "M-A",
        nameEn: "Instance A",
        quantity: 2,
        actualCurrency: "USD",
        actualUnitPrice: 10,
        actualTotalAmount: 20,
        contractCurrency: "USD",
        contractUnitPrice: 10,
        contractTotalAmount: 240,
        writeOffStartMonth: "2026-07-15",
      },
    ]);

    expect(preview.report).toMatchObject({ total: 1, success: 1, failed: [] });
    expect(preview.summary).toMatchObject({ masterCount: 1, detailCount: 1 });
    expect(preview.operations.prepaymentContracts[0]).toMatchObject({
      contractNo: "PP-INIT-001",
      status: "草稿",
      totalAmount: 240,
      confirmedAt: null,
    });
    expect(preview.operations.prepaymentContractItems[0]).toMatchObject({
      contractNo: "PP-INIT-001",
      writeOffStartMonth: "2026-07-01",
    });
    expect(preview.operations.monthlyPrepaymentWriteOffs).toHaveLength(0);
  });

  it("builds prepayment draft rows by resolving purchase item from request number, PO number, and product code", () => {
    const preview = buildImportPreview(
      "prepayment-contracts",
      [
        {
          contractNo: "PP-DRAFT-001",
          status: "",
          currency: "USD",
          effectiveDate: "2026-07-01",
          lineType: "instance",
          purchaseOrderItemId: "",
          requestNo: "REQ-001",
          poNo: "PO-001",
          deviceCode: "DEV-A",
          contractCurrency: "USD",
          contractTotalAmount: 20,
          writeOffStartMonth: "2026-07-15",
        },
      ],
      {
        prepaymentPurchaseLines: [
          {
            purchaseOrderItemId: "POI-001",
            requestItemId: "RI-001",
            countryCode: "BR",
            batchName: "BR-1",
            requestNo: "REQ-001",
            poNo: "PO-001",
            deviceCode: "DEV-A",
            modelCode: "M-A",
            nameEn: "Instance A",
            quantity: 2,
            actualCurrency: "USD",
            actualUnitPrice: 10,
            actualTotalAmount: 20,
          },
        ],
      },
    );

    expect(preview.report).toMatchObject({ total: 1, success: 1, failed: [] });
    expect(preview.operations.prepaymentContracts[0]).toMatchObject({
      contractNo: "PP-DRAFT-001",
      status: "草稿",
      totalAmount: 20,
      confirmedAt: null,
    });
    expect(preview.operations.prepaymentContractItems[0]).toMatchObject({
      purchaseOrderItemId: "POI-001",
      requestItemId: "RI-001",
      countryCode: "BR",
      batchName: "BR-1",
      requestNo: "REQ-001",
      poNo: "PO-001",
      deviceCode: "DEV-A",
      modelCode: "M-A",
      nameEn: "Instance A",
      quantity: 2,
      actualCurrency: "USD",
      actualUnitPrice: 10,
      actualTotalAmount: 20,
    });
    expect(preview.operations.monthlyPrepaymentWriteOffs).toHaveLength(0);
  });

  it("groups request order rows into master and detail rows", () => {
    const preview = buildImportPreview("request-orders", [
      {
        requestNo: "REQ-001",
        countryCode: "BR",
        contractNo: "IC-BR-1",
        batchName: "BR-1",
        requestType: "整机",
        status: "",
        plannedDeliveryDate: "2026-08-01",
        requestedAt: "2026-07-10",
        deviceCode: "DEV-A",
        supplierId: "SUP-A",
        undertakingUnitId: "UNIT-A",
        quantity: 2,
      },
      {
        requestNo: "REQ-001",
        countryCode: "BR",
        contractNo: "IC-BR-1",
        batchName: "BR-1",
        requestType: "整机",
        status: "",
        plannedDeliveryDate: "2026-08-01",
        requestedAt: "2026-07-10",
        deviceCode: "DEV-B",
        supplierId: "SUP-A",
        undertakingUnitId: "UNIT-A",
        quantity: 3,
      },
    ]);

    expect(preview.report).toMatchObject({ total: 2, success: 2, failed: [] });
    expect(preview.summary).toMatchObject({ masterCount: 1, detailCount: 2 });
    expect(preview.operations.requests).toEqual([
      expect.objectContaining({
        requestNo: "REQ-001",
        countryCode: "BR",
        batchName: "BR-1",
        status: "草稿",
      }),
    ]);
    expect(preview.operations.requestItems).toEqual([
      expect.objectContaining({ id: "RI-REQ-001-001", requestNo: "REQ-001", deviceCode: "DEV-A", quantity: 2 }),
      expect.objectContaining({ id: "RI-REQ-001-002", requestNo: "REQ-001", deviceCode: "DEV-B", quantity: 3 }),
    ]);
  });

  it("groups purchase order rows into master and detail rows", () => {
    const preview = buildImportPreview("purchase-orders", [
      {
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-MANUAL-001",
        requestNo: "REQ-001",
        status: "",
        currency: "CNY",
        releasedAt: "2026-07-11",
        requestItemId: "RI-REQ-001-001",
        unitPrice: 10,
        hardwareCoefficient: 1,
        softwareCoefficient: 0.2,
      },
      {
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-MANUAL-001",
        requestNo: "REQ-002",
        status: "",
        currency: "CNY",
        releasedAt: "2026-07-11",
        requestItemId: "RI-REQ-002-001",
        unitPrice: 20,
        hardwareCoefficient: 1,
        softwareCoefficient: 0,
      },
    ]);

    expect(preview.report).toMatchObject({ total: 2, success: 2, failed: [] });
    expect(preview.summary).toMatchObject({ masterCount: 1, detailCount: 2 });
    expect(preview.operations.purchaseOrders).toEqual([
      expect.objectContaining({
        purchaseOrderId: "PO-SYS-001",
        poNo: "PO-MANUAL-001",
        requestNo: "REQ-001,REQ-002",
        sourceRequestNos: "REQ-001,REQ-002",
        status: "草稿",
        currency: "CNY",
      }),
    ]);
    expect(preview.operations.purchaseOrderItems[0]).toMatchObject({
      id: "POI-PO-SYS-001-001",
      poNo: "PO-MANUAL-001",
      requestNo: "REQ-001",
      totalCoefficient: 1.2,
    });
  });

  it("resolves purchase import request detail id from request number and product code", () => {
    const preview = buildImportPreview(
      "purchase-orders",
      [
        {
          purchaseOrderId: "PO-SYS-002",
          poNo: "PO-MANUAL-002",
          requestNo: "REQ-001",
          deviceCode: "DEV-A",
          status: "",
          currency: "USD",
          releasedAt: "2026-07-11",
          requestItemId: "",
          unitPrice: 10,
          hardwareCoefficient: 1,
          softwareCoefficient: 0,
        },
      ],
      {
        requestItems: [{ id: "RI-REQ-001-001", requestNo: "REQ-001", deviceCode: "DEV-A" }],
      },
    );

    expect(preview.report).toMatchObject({ total: 1, success: 1, failed: [] });
    expect(preview.operations.purchaseOrderItems[0]).toMatchObject({
      requestItemId: "RI-REQ-001-001",
    });
  });

  it("keeps imported purchase details attached to the existing system purchase id for the same PO number", () => {
    const preview = buildImportPreview(
      "purchase-orders",
      [
        {
          purchaseOrderId: "XIT-USER-001",
          poNo: "PO-EXISTING-001",
          requestNo: "REQ-001",
          status: "",
          currency: "USD",
          requestItemId: "RI-REQ-001-001",
          unitPrice: 10,
        },
      ],
      {
        purchaseOrders: [{ purchaseOrderId: "PO-SYS-EXISTING-001", poNo: "PO-EXISTING-001" }],
      },
    );

    expect(preview.operations.purchaseOrders[0]).toMatchObject({
      purchaseOrderId: "PO-SYS-EXISTING-001",
      poNo: "PO-EXISTING-001",
    });
    expect(preview.operations.purchaseOrderItems[0]).toMatchObject({
      purchaseOrderId: "PO-SYS-EXISTING-001",
      poNo: "PO-EXISTING-001",
    });
  });

  it("reports purchase import rows when product code cannot be matched", () => {
    const preview = buildImportPreview("purchase-orders", [
      {
        purchaseOrderId: "PO-SYS-003",
        poNo: "PO-MANUAL-003",
        requestNo: "REQ-404",
        deviceCode: "DEV-X",
        status: "",
        currency: "USD",
        requestItemId: "",
        unitPrice: 10,
      },
    ]);

    expect(preview.report.success).toBe(0);
    expect(preview.report.failed[0].error).toContain("未找到对应需求明细");
  });

  it("reports row-level validation failures", () => {
    const preview = buildImportPreview("request-orders", [
      { requestNo: "", countryCode: "BR", deviceCode: "DEV-A", supplierId: "SUP-A", quantity: 1 },
    ]);

    expect(preview.report.success).toBe(0);
    expect(preview.report.failed).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        error: expect.stringContaining("需求单号不能为空"),
      }),
    ]);
  });

  it("normalizes boolean labels in generic entity imports", () => {
    const config = {
      primaryKey: "shipmentId",
      formFields: [
        { key: "shipmentId", label: "物流ID" },
        { key: "isReceived", label: "是否签收", type: "boolean" },
      ],
    } as EntityConfig;

    expect(normalizeEntityImportRow(config, { shipmentId: "SHP-1", isReceived: "是" })).toMatchObject({
      shipmentId: "SHP-1",
      isReceived: true,
    });
    expect(normalizeEntityImportRow(config, { shipmentId: "SHP-2", isReceived: "否" })).toMatchObject({
      shipmentId: "SHP-2",
      isReceived: false,
    });
  });

  it("does not treat data rows with slash dates as template note rows", () => {
    expect(
      isImportTemplateNoteRow({
        需求单号: "REQ-001",
        国家: "BR",
        计划交付日期: "2026/07/10",
        需求时间: "2026/07/01",
      }),
    ).toBe(false);

    expect(
      isImportTemplateNoteRow({
        需求单号: "必填",
        国家: "必填",
        需求单状态: "为空默认草稿",
      }),
    ).toBe(true);
  });

  it("normalizes imported request date fields to yyyy-mm-dd without shifting the day", () => {
    const preview = buildImportPreview("request-orders", [
      {
        requestNo: "REQ-DATE-001",
        countryCode: "BR",
        contractNo: "IC-BR-1",
        batchName: "BR-1",
        requestType: "整机",
        status: "",
        plannedDeliveryDate: "2026/7/10",
        requestedAt: "2026/7/1",
        deviceCode: "DEV-A",
        supplierId: "SUP-A",
        undertakingUnitId: "UNIT-A",
        quantity: 1,
      },
    ]);

    expect(preview.operations.requests[0].plannedDeliveryDate).toBe("2026-07-10");
    expect(preview.operations.requestItems[0].requestedAt).toBe("2026-07-01");
  });
});
