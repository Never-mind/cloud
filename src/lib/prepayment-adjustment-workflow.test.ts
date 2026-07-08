import { describe, expect, it } from "vitest";
import {
  applyPrepaymentWriteOffAdjustments,
  buildPrepaymentWriteOffAdjustmentItems,
  mergePrepaymentAdjustmentSelection,
} from "./prepayment-adjustment-workflow";

describe("prepayment write-off adjustment workflow", () => {
  const monthlyRows = [
    {
      id: "MWO-001",
      contractNo: "PRE-001",
      contractLineId: "PPCI-001",
      writeOffMonth: "2026-07-01",
      currency: "USD",
      monthlyAmount: 100,
      lineType: "instance" as const,
      countryCode: "BR",
      batchName: "BR-B1",
      requestNo: "REQ-001",
      poNo: "PO-001",
      deviceCode: "DEV-001",
      modelCode: "M-001",
      nameEn: "Compute Node",
      quantity: 2,
    },
    {
      id: "MWO-002",
      contractNo: "PRE-001",
      contractLineId: "PPCI-001",
      writeOffMonth: "2026-08-01",
      currency: "USD",
      monthlyAmount: 100,
      lineType: "instance" as const,
      countryCode: "BR",
      batchName: "BR-B1",
      requestNo: "REQ-001",
      poNo: "PO-001",
      deviceCode: "DEV-001",
      modelCode: "M-001",
      nameEn: "Compute Node",
      quantity: 2,
    },
  ];

  it("builds adjustment items with original amount, adjusted amount, and difference", () => {
    const items = buildPrepaymentWriteOffAdjustmentItems({
      adjustmentNo: "PWA-001",
      rows: [monthlyRows[0]],
      adjustedAmounts: { "MWO-001": 130 },
    });

    expect(items).toEqual([
      expect.objectContaining({
        id: "PWA-001-001",
        adjustmentNo: "PWA-001",
        monthlyWriteOffId: "MWO-001",
        originalMonthlyAmount: 100,
        adjustedMonthlyAmount: 130,
        differenceAmount: 30,
        writeOffMonth: "2026-07-01",
        deviceCode: "DEV-001",
      }),
    ]);
  });

  it("applies confirmed adjustments only to selected monthly write-off rows", () => {
    const adjustedRows = applyPrepaymentWriteOffAdjustments({
      rows: monthlyRows,
      adjustmentNo: "PWA-001",
      items: [
        {
          monthlyWriteOffId: "MWO-001",
          adjustedMonthlyAmount: 130,
        },
      ],
    });

    expect(adjustedRows).toEqual([
      expect.objectContaining({
        id: "MWO-001",
        monthlyAmount: 130,
        sourceType: "调整单",
        adjustmentNo: "PWA-001",
      }),
      expect.objectContaining({
        id: "MWO-002",
        monthlyAmount: 100,
        sourceType: "",
        adjustmentNo: "",
      }),
    ]);
  });

  it("adds searched rows into the adjustment selection without duplicating existing rows", () => {
    const selectedRows = mergePrepaymentAdjustmentSelection({
      currentRows: [monthlyRows[0]],
      rowsToAdd: [monthlyRows[0], monthlyRows[1]],
    });

    expect(selectedRows.map((row) => row.id)).toEqual(["MWO-001", "MWO-002"]);
  });
});
