import { describe, expect, it } from "vitest";
import {
  buildMonthlyWriteOffRows,
  buildPrepaymentDraft,
  filterAvailablePrepaymentLines,
  summarizePrepaymentSelection,
  toPrepaymentContractLineStorage,
} from "./prepayment-workflow";

const confirmedPurchaseLines = [
  {
    id: "POI-1",
    poNo: "PO-1",
    requestNo: "REQ-1",
    countryCode: "BR",
    batchName: "Batch A",
    requestItemId: "RI-1",
    deviceCode: "DEV-1",
    modelCode: "M1",
    nameEn: "Compute One",
    quantity: 2,
    currency: "USD",
    unitPrice: 120,
  },
  {
    id: "POI-2",
    poNo: "PO-1",
    requestNo: "REQ-1",
    countryCode: "BR",
    batchName: "Batch A",
    requestItemId: "RI-2",
    deviceCode: "DEV-2",
    modelCode: "M2",
    nameEn: "Compute Two",
    quantity: 1,
    currency: "USD",
    unitPrice: 80,
  },
];

describe("prepayment workflow", () => {
  it("stores fee lines without a purchase order item id", () => {
    const line = buildPrepaymentDraft({
      contractNo: "PPC-FEE",
      effectiveDate: "2026-07-01",
      purchaseLines: confirmedPurchaseLines.slice(0, 1),
    }).lines[0];

    expect(
      toPrepaymentContractLineStorage({
        ...line,
        lineType: "fee",
        purchaseOrderItemId: "",
        requestItemId: "",
      }),
    ).toMatchObject({
      lineType: "fee",
      purchaseOrderItemId: null,
      requestItemId: null,
    });
  });

  it("preserves and trims the purchase order item id for instance lines", () => {
    const line = buildPrepaymentDraft({
      contractNo: "PPC-INSTANCE",
      effectiveDate: "2026-07-01",
      purchaseLines: confirmedPurchaseLines.slice(0, 1),
    }).lines[0];

    expect(
      toPrepaymentContractLineStorage({
        ...line,
        purchaseOrderItemId: "  POI-1  ",
        requestItemId: "  RI-1  ",
      }),
    ).toMatchObject({
      lineType: "instance",
      purchaseOrderItemId: "POI-1",
      requestItemId: "RI-1",
    });
  });

  it("keeps only purchase lines that are not occupied by a draft or confirmed prepayment contract", () => {
    const rows = filterAvailablePrepaymentLines({
      purchaseLines: confirmedPurchaseLines,
      occupiedPurchaseOrderItemIds: ["POI-2"],
    });

    expect(rows.map((row) => row.id)).toEqual(["POI-1"]);
    expect(rows[0]).toMatchObject({
      actualTotalAmount: 240,
      currency: "USD",
      countryCode: "BR",
    });
  });

  it("summarizes selected quantities and amounts for the floating confirmation bar", () => {
    expect(summarizePrepaymentSelection(confirmedPurchaseLines)).toEqual({
      selectedRows: 2,
      totalQuantity: 3,
      actualTotalAmount: 320,
      contractTotalAmount: 320,
    });
  });

  it("builds a draft contract with editable contract amounts defaulting from actual amounts", () => {
    const draft = buildPrepaymentDraft({
      contractNo: "PPC-001",
      effectiveDate: "2026-07-01",
      purchaseLines: confirmedPurchaseLines,
    });

    expect(draft.contract).toMatchObject({
      contractNo: "PPC-001",
      status: "草稿",
      currency: "USD",
      effectiveDate: "2026-07-01",
      totalAmount: 320,
    });
    expect(draft.lines).toMatchObject([
      {
        id: "PPCI-PPC-001-001",
        lineType: "instance",
        purchaseOrderItemId: "POI-1",
        countryCode: "BR",
        contractCurrency: "USD",
        contractUnitPrice: 120,
        contractTotalAmount: 240,
        writeOffStartMonth: "2026-07-01",
      },
      {
        id: "PPCI-PPC-001-002",
        lineType: "instance",
        purchaseOrderItemId: "POI-2",
        countryCode: "BR",
        contractCurrency: "USD",
        contractUnitPrice: 80,
        contractTotalAmount: 80,
        writeOffStartMonth: "2026-07-01",
      },
    ]);
  });

  it("spreads each confirmed line into 24 monthly write-off rows and keeps rounding remainder in the last month", () => {
    const rows = buildMonthlyWriteOffRows([
      {
        id: "PPCI-1",
        contractNo: "PPC-001",
        lineType: "instance",
        batchName: "Batch A",
        requestNo: "REQ-1",
        countryCode: "BR",
        poNo: "PO-1",
        deviceCode: "DEV-1",
        modelCode: "M1",
        nameEn: "Compute One",
        quantity: 2,
        contractCurrency: "USD",
        contractTotalAmount: 100,
        writeOffStartMonth: "2026-07-01",
      },
    ]);

    expect(rows).toHaveLength(24);
    expect(rows[0]).toMatchObject({
      id: "MWO-PPCI-1-001",
      contractLineId: "PPCI-1",
      countryCode: "BR",
      writeOffMonth: "2026-07-01",
      monthIndex: 1,
      monthlyAmount: 4.17,
    });
    expect(rows[23]).toMatchObject({
      id: "MWO-PPCI-1-024",
      writeOffMonth: "2028-06-01",
      monthIndex: 24,
      monthlyAmount: 4.09,
    });
    expect(Math.round(rows.reduce((total, row) => total + row.monthlyAmount, 0) * 100) / 100).toBe(100);
  });

  it("accepts database Date objects as write-off start months", () => {
    const rows = buildMonthlyWriteOffRows([
      {
        id: "PPCI-DATE",
        contractNo: "PPC-001",
        lineType: "fee",
        contractCurrency: "USD",
        contractTotalAmount: 24,
        writeOffStartMonth: new Date("2026-07-01T00:00:00") as any,
      },
    ]);

    expect(rows[0].writeOffMonth).toBe("2026-07-01");
    expect(rows[23].writeOffMonth).toBe("2028-06-01");
  });
});
