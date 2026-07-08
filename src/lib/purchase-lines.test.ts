import { describe, expect, it } from "vitest";
import {
  buildPurchaseProductLines,
  calculatePurchaseTotalAmount,
  filterPurchaseProductLines,
  formatPurchaseProductLineForExport,
} from "./purchase-lines";

describe("purchase product lines", () => {
  it("joins purchase items with request items, request batch, instance models, and purchase orders", () => {
    const rows = buildPurchaseProductLines({
      purchaseOrders: [
        { poNo: "PO-1", requestNo: "REQ-1", status: "草稿", currency: "USD" },
      ],
      purchaseItems: [
        { id: "POI-1", poNo: "PO-1", requestItemId: "RI-1", unitPrice: 88 },
      ],
      requestItems: [
        { id: "RI-1", requestNo: "REQ-1", deviceCode: "DEV-1", quantity: 3 },
      ],
      requests: [
        { requestNo: "REQ-1", batchName: "BATCH-A" },
      ],
      instanceModels: [
        { deviceCode: "DEV-1", nameZh: "计算增强型", nameEn: "Compute Enhanced" },
      ],
    });

    expect(rows).toEqual([
      {
        id: "POI-1",
        poNo: "PO-1",
        requestNo: "REQ-1",
        batchName: "BATCH-A",
        status: "草稿",
        currency: "USD",
        requestItemId: "RI-1",
        deviceCode: "DEV-1",
        nameZh: "计算增强型",
        nameEn: "Compute Enhanced",
        quantity: 3,
        unitPrice: 88,
        totalAmount: 264,
      },
    ]);
  });

  it("can keep only confirmed purchase order lines", () => {
    const rows = buildPurchaseProductLines({
      confirmedOnly: true,
      purchaseOrders: [
        { poNo: "PO-DRAFT", requestNo: "REQ-1", status: "草稿", currency: "USD" },
        { poNo: "PO-CONFIRMED", requestNo: "REQ-2", status: "已确认", currency: "USD" },
      ],
      purchaseItems: [
        { id: "POI-DRAFT", poNo: "PO-DRAFT", requestItemId: "RI-1", unitPrice: 88 },
        { id: "POI-CONFIRMED", poNo: "PO-CONFIRMED", requestItemId: "RI-2", unitPrice: 99 },
      ],
      requestItems: [
        { id: "RI-1", requestNo: "REQ-1", deviceCode: "DEV-1", quantity: 3 },
        { id: "RI-2", requestNo: "REQ-2", deviceCode: "DEV-2", quantity: 5 },
      ],
      instanceModels: [
        { deviceCode: "DEV-1", nameZh: "Model 1", nameEn: "Model 1" },
        { deviceCode: "DEV-2", nameZh: "Model 2", nameEn: "Model 2" },
      ],
    });

    expect(rows.map((row) => row.poNo)).toEqual(["PO-CONFIRMED"]);
  });

  it("treats legacy encoded confirmed statuses as confirmed", () => {
    const rows = buildPurchaseProductLines({
      confirmedOnly: true,
      purchaseOrders: [
        { poNo: "PO-CONFIRMED", requestNo: "REQ-1", status: "宸茬‘璁?", currency: "USD" },
      ],
      purchaseItems: [
        { id: "POI-CONFIRMED", poNo: "PO-CONFIRMED", requestItemId: "RI-1", unitPrice: 88 },
      ],
      requestItems: [
        { id: "RI-1", requestNo: "REQ-1", deviceCode: "DEV-1", quantity: 3 },
      ],
      instanceModels: [
        { deviceCode: "DEV-1", nameZh: "Model 1", nameEn: "Model 1" },
      ],
    });

    expect(rows.map((row) => row.poNo)).toEqual(["PO-CONFIRMED"]);
  });

  it("calculates purchase total amount from quantity and unit price", () => {
    expect(
      calculatePurchaseTotalAmount([
        { quantity: 3, unitPrice: 88 },
        { quantity: "2", unitPrice: "12.5" },
        { quantity: null, unitPrice: 99 },
      ]),
    ).toBe(289);
  });

  it("exports purchase product lines with total amount", () => {
    expect(
      formatPurchaseProductLineForExport({
        id: "POI-1",
        poNo: "PO-1",
        requestNo: "REQ-1",
        batchName: "BATCH-A",
        status: "已确认",
        currency: "USD",
        requestItemId: "RI-1",
        deviceCode: "DEV-1",
        nameZh: "计算增强型",
        nameEn: "Compute Enhanced",
        quantity: 3,
        unitPrice: 88,
        totalAmount: 264,
      }),
    ).toEqual({
      采购订单号: "PO-1",
      来源需求单: "REQ-1",
      批次号: "BATCH-A",
      采购状态: "已确认",
      产品实例编码: "DEV-1",
      中文名称: "计算增强型",
      英文名称: "Compute Enhanced",
      数量: 3,
      币种: "USD",
      单价: 88,
      总价: 264,
    });
  });

  it("filters purchase product lines by keyword across displayed fields", () => {
    const rows = [
      {
        id: "POI-1",
        poNo: "PO-1",
        requestNo: "REQ-1",
        batchName: "BATCH-A",
        status: "已确认",
        currency: "USD",
        requestItemId: "RI-1",
        deviceCode: "DEV-1",
        nameZh: "计算增强型",
        nameEn: "Compute Enhanced",
        quantity: 3,
        unitPrice: 88,
        totalAmount: 264,
      },
    ];

    expect(filterPurchaseProductLines(rows, "enhanced")).toHaveLength(1);
    expect(filterPurchaseProductLines(rows, "missing")).toHaveLength(0);
  });

  it("shows the newest purchase detail lines first", () => {
    const rows = buildPurchaseProductLines({
      purchaseOrders: [
        { poNo: "PO-OLD", requestNo: "REQ-OLD", status: "已确认", currency: "USD", createdAt: "2026-07-01T00:00:00.000Z" },
        { poNo: "PO-NEW", requestNo: "REQ-NEW", status: "已确认", currency: "USD", createdAt: "2026-07-08T00:00:00.000Z" },
      ],
      purchaseItems: [
        { id: "POI-OLD", poNo: "PO-OLD", requestItemId: "RI-OLD", unitPrice: 1 },
        { id: "POI-NEW", poNo: "PO-NEW", requestItemId: "RI-NEW", unitPrice: 1 },
      ],
      requestItems: [
        { id: "RI-OLD", requestNo: "REQ-OLD", deviceCode: "DEV-1", quantity: 1 },
        { id: "RI-NEW", requestNo: "REQ-NEW", deviceCode: "DEV-2", quantity: 1 },
      ],
      instanceModels: [],
    });

    expect(rows.map((row) => row.poNo)).toEqual(["PO-NEW", "PO-OLD"]);
  });
});
