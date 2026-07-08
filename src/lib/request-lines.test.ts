import { describe, expect, it } from "vitest";
import { buildRequestProductLines } from "./request-lines";

describe("request product lines", () => {
  it("joins requests with request items, instance models, and suppliers", () => {
    const rows = buildRequestProductLines({
      requests: [
        {
          requestNo: "REQ-1",
          countryCode: "CL",
          batchName: "CL第1批",
          status: "采购中",
          plannedDeliveryDate: "2026-07-20",
          createdAt: "2026-07-01",
          updatedAt: "2026-07-02",
        },
      ],
      requestItems: [
        { id: "RI-1", requestNo: "REQ-1", deviceCode: "DEV-1", supplierId: "SUP-1", quantity: 3 },
      ],
      instanceModels: [
        { deviceCode: "DEV-1", modelCode: "MODEL-1", nameEn: "Compute Enhanced" },
      ],
      suppliers: [
        { supplierId: "SUP-1", name: "ODM Supplier" },
      ],
    });

    expect(rows).toEqual([
      {
        id: "RI-1",
        countryCode: "CL",
        batchName: "CL第1批",
        requestNo: "REQ-1",
        deviceCode: "DEV-1",
        modelCode: "MODEL-1",
        nameEn: "Compute Enhanced",
        supplierName: "ODM Supplier",
        quantity: 3,
        plannedDeliveryDate: "2026-07-20",
        createdAt: "2026-07-01",
        updatedAt: "2026-07-02",
      },
    ]);
  });

  it("can keep only confirmed request order lines", () => {
    const rows = buildRequestProductLines({
      confirmedOnly: true,
      requests: [
        { requestNo: "REQ-DRAFT", status: "草稿", batchName: "草稿批次" },
        { requestNo: "REQ-CONFIRMED", status: "待下单", batchName: "确认批次" },
      ],
      requestItems: [
        { id: "RI-DRAFT", requestNo: "REQ-DRAFT", deviceCode: "DEV-1", supplierId: "SUP-1", quantity: 1 },
        { id: "RI-CONFIRMED", requestNo: "REQ-CONFIRMED", deviceCode: "DEV-2", supplierId: "SUP-1", quantity: 2 },
      ],
      instanceModels: [
        { deviceCode: "DEV-1", modelCode: "MODEL-1", nameEn: "Draft Model" },
        { deviceCode: "DEV-2", modelCode: "MODEL-2", nameEn: "Confirmed Model" },
      ],
      suppliers: [{ supplierId: "SUP-1", name: "ODM Supplier" }],
    });

    expect(rows.map((row) => row.requestNo)).toEqual(["REQ-CONFIRMED"]);
  });
});
