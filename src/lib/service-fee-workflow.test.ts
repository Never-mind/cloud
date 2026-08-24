import { describe, expect, it } from "vitest";
import { buildServiceFeeRows, summarizeServiceFeeRows } from "./service-fee-workflow";

describe("service fee workflow", () => {
  it("subtracts monthly prepayment write-off from monthly billing write-off by month and business key", () => {
    const rows = buildServiceFeeRows({
      billingRows: [
        {
          id: "MBW-001",
          writeOffMonth: "2026-07-01",
          countryCode: "BR",
          batchName: "BR-1",
          requestNo: "REQ-001",
          poNo: "PO-001",
          deviceCode: "DEV-001",
          modelCode: "MODEL-001",
          nameEn: "Compute Node",
          supplierId: "SUP-1",
          undertakingUnitId: "UNIT-1",
          customerId: "CUS-1",
          quantity: 2,
          currency: "CLP",
          vatRate: 0.16,
          monthlyAmount: 500,
          monthlyTotalAmount: 1000,
          ledgerId: "BIL-001",
        },
      ],
      prepaymentRows: [
        {
          id: "MPW-001",
          writeOffMonth: "2026-07-01",
          countryCode: "BR",
          batchName: "BR-1",
          requestNo: "REQ-001",
          poNo: "PO-001",
          deviceCode: "DEV-001",
          modelCode: "MODEL-001",
          nameEn: "Compute Node",
          quantity: 2,
          currency: "USD",
          monthlyAmount: 120,
          contractNo: "PRE-001",
          lineType: "instance",
        },
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        writeOffMonth: "2026-07-01",
        countryCode: "BR",
        batchName: "BR-1",
        requestNo: "REQ-001",
        poNo: "PO-001",
        deviceCode: "DEV-001",
        supplierId: "SUP-1",
        undertakingUnitId: "UNIT-1",
        customerId: "CUS-1",
        lineType: "instance",
        billingCurrency: "CLP",
        billingAmount: 1000,
        prepaymentCurrency: "USD",
        prepaymentAmount: 120,
        serviceFeeAmount: 880,
        serviceFeeAmountExcludingTax: 758.6207,
        billingSourceIds: "MBW-001",
        prepaymentSourceIds: "MPW-001",
      }),
    ]);
  });

  it("calculates service fee excluding VAT from the country tax rate", () => {
    const rows = buildServiceFeeRows({
      billingRows: [
        {
          id: "MBW-VAT",
          writeOffMonth: "2026-07-01",
          countryCode: "MX",
          quantity: 1,
          currency: "MXN",
          vatRate: 0.16,
          monthlyTotalAmount: 116,
        },
      ],
      prepaymentRows: [{ id: "MPW-VAT", writeOffMonth: "2026-07-01", countryCode: "MX", monthlyAmount: 16, lineType: "instance" }],
    });

    expect(rows[0]).toMatchObject({ serviceFeeAmount: 100, serviceFeeAmountExcludingTax: 86.2069 });
  });

  it("keeps rows that only exist in billing or prepayment and treats the missing side as zero", () => {
    const rows = buildServiceFeeRows({
      billingRows: [
        {
          id: "MBW-ONLY",
          writeOffMonth: "2026-07-01",
          countryCode: "MX",
          batchName: "MX-1",
          requestNo: "REQ-002",
          poNo: "PO-002",
          deviceCode: "DEV-002",
          modelCode: "MODEL-002",
          nameEn: "GPU Node",
          quantity: 1,
          currency: "USD",
          monthlyAmount: 300,
          ledgerId: "BIL-ONLY",
        },
      ],
      prepaymentRows: [
        {
          id: "MPW-FEE",
          writeOffMonth: "2026-07-01",
          countryCode: "MX",
          batchName: "MX-1",
          requestNo: "",
          poNo: "",
          deviceCode: "",
          modelCode: "",
          nameEn: "Customs service",
          quantity: 0,
          currency: "USD",
          monthlyAmount: 50,
          contractNo: "PRE-FEE",
          lineType: "fee",
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineType: "instance",
          billingAmount: 300,
          prepaymentAmount: 0,
          serviceFeeAmount: 300,
        }),
        expect.objectContaining({
          lineType: "fee",
          nameEn: "Customs service",
          billingAmount: 0,
          prepaymentAmount: 50,
          serviceFeeAmount: -50,
        }),
      ]),
    );
  });

  it("summarizes billing, prepayment, service fee, instance fee and non-instance fee totals", () => {
    const summary = summarizeServiceFeeRows([
      { billingAmount: 1000, prepaymentAmount: 120, serviceFeeAmount: 880, lineType: "instance" },
      { billingAmount: 0, prepaymentAmount: 50, serviceFeeAmount: -50, lineType: "fee" },
    ]);

    expect(summary).toEqual({
      billingTotal: 1000,
      prepaymentTotal: 170,
      serviceFeeTotal: 830,
      instanceServiceFeeTotal: 880,
      feeServiceFeeTotal: -50,
    });
  });
});
