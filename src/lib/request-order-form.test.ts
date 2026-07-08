import { describe, expect, it } from "vitest";
import { buildRequestItemRows } from "./request-order-form";

describe("request order form", () => {
  it("fills request item rows from the master order when saving", () => {
    expect(
      buildRequestItemRows({
        requestNo: "REQ-NEW-001",
        requestedAt: "2026-07-20",
        details: [
          { deviceCode: "DEV-1", supplierId: "SUP-1", quantity: 2 },
          { deviceCode: "DEV-2", supplierId: "SUP-2", quantity: 3 },
        ],
      }),
    ).toEqual([
      {
        id: "RI-REQ-NEW-001-001",
        requestNo: "REQ-NEW-001",
        deviceCode: "DEV-1",
        supplierId: "SUP-1",
        requestedAt: "2026-07-20",
        quantity: 2,
      },
      {
        id: "RI-REQ-NEW-001-002",
        requestNo: "REQ-NEW-001",
        deviceCode: "DEV-2",
        supplierId: "SUP-2",
        requestedAt: "2026-07-20",
        quantity: 3,
      },
    ]);
  });
});
