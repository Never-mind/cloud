import { describe, expect, it } from "vitest";
import { getOrderDeleteBlockReason } from "./order-delete-policy";

describe("order delete policy", () => {
  it("allows deleting orders without billing or prepayment data", () => {
    expect(
      getOrderDeleteBlockReason({
        billingLedgerCount: 0,
        monthlyBillingCount: 0,
        prepaymentContractItemCount: 0,
        monthlyPrepaymentCount: 0,
      }),
    ).toBeNull();
  });

  it("blocks deleting orders after billing data is generated", () => {
    expect(
      getOrderDeleteBlockReason({
        billingLedgerCount: 1,
        monthlyBillingCount: 0,
        prepaymentContractItemCount: 0,
        monthlyPrepaymentCount: 0,
      }),
    ).toBe("该单据已生成月账单，不能删除");
  });

  it("blocks deleting orders after prepayment data is generated", () => {
    expect(
      getOrderDeleteBlockReason({
        billingLedgerCount: 0,
        monthlyBillingCount: 0,
        prepaymentContractItemCount: 1,
        monthlyPrepaymentCount: 0,
      }),
    ).toBe("该单据已生成预付款，不能删除");
  });
});
