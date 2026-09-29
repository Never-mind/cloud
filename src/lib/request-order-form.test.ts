import { describe, expect, it } from "vitest";
import { buildRequestItemRows } from "./request-order-form";

describe("request order form", () => {
  it("fills request item rows from the master order when saving", () => {
    expect(
      buildRequestItemRows({
        requestNo: "REQ-NEW-001",
        requestedAt: "2026-07-20",
        details: [
          { deviceCode: "DEV-1", supplierId: "SUP-1", undertakingUnitId: "UNIT-1", customerId: "CUS-1", quantity: 2 },
          { deviceCode: "DEV-2", supplierId: "SUP-2", undertakingUnitId: "UNIT-2", customerId: "CUS-2", quantity: 3 },
        ],
      }),
    ).toEqual([
      {
        id: "RI-REQ-NEW-001-001",
        requestNo: "REQ-NEW-001",
        requestType: "整机",
        deviceCode: "DEV-1",
        supplierId: "SUP-1",
        undertakingUnitId: "UNIT-1",
        customerId: "CUS-1",
        requestedAt: "2026-07-20",
        quantity: 2,
      },
      {
        id: "RI-REQ-NEW-001-002",
        requestNo: "REQ-NEW-001",
        requestType: "整机",
        deviceCode: "DEV-2",
        supplierId: "SUP-2",
        undertakingUnitId: "UNIT-2",
        customerId: "CUS-2",
        requestedAt: "2026-07-20",
        quantity: 3,
      },
    ]);
  });

  it("propagates the spare-parts type to every request detail", () => {
    const rows = buildRequestItemRows({
      requestNo: "REQ-SPARE-001",
      requestedAt: "2026-08-25",
      requestType: "备件",
      details: [
        { deviceCode: "SPARE-1", supplierId: "SUP-1", undertakingUnitId: "UNIT-1", customerId: "", quantity: 2 },
      ],
    });

    expect(rows[0]).toMatchObject({ requestNo: "REQ-SPARE-001", requestType: "备件" });
  });

  // 回归：早先这里一律按行位置生成 RI-<需求单号>-001，加载已有需求单时又把行主键丢掉，
  // 于是保存时会查不到老行（如 F-DOI-00107）而新建一条，同一个实例出现两条一模一样明细。
  it("已存在的明细沿用原主键，不按位置重编", () => {
    const rows = buildRequestItemRows({
      requestNo: "eSHWC260603eu16",
      requestedAt: "2026-09-07",
      details: [
        { id: "F-DOI-00107", deviceCode: "06114898", supplierId: "SUP-1", undertakingUnitId: "UNIT-1", customerId: "CUS-1", quantity: 24 },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("F-DOI-00107");
  });

  it("新增行的编号不会撞到已有行", () => {
    const rows = buildRequestItemRows({
      requestNo: "REQ-001",
      requestedAt: "2026-09-07",
      details: [
        { id: "RI-REQ-001-002", deviceCode: "DEV-2", supplierId: "SUP-2", undertakingUnitId: "UNIT-2", customerId: "CUS-2", quantity: 3 },
        { deviceCode: "DEV-NEW", supplierId: "SUP-3", undertakingUnitId: "UNIT-3", customerId: "CUS-3", quantity: 1 },
      ],
    });

    expect(rows[0].id).toBe("RI-REQ-001-002");
    expect(rows[1].id).toBe("RI-REQ-001-003");
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });
});
