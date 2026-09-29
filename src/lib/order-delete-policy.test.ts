import { describe, expect, it } from "vitest";
import { getOrderDeleteBlockReason, getPurchaseOrderCascadeBlockReason } from "./order-delete-policy";

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

describe("purchase order cascade delete policy", () => {
  const base = { poNo: "PO-001", confirmed: false, pricedItemCount: 0, shipmentCount: 0 };

  it("允许连带删除空白采购草稿", () => {
    expect(getPurchaseOrderCascadeBlockReason(base)).toBeNull();
  });

  it("已确认的采购订单不允许被连带删除", () => {
    expect(getPurchaseOrderCascadeBlockReason({ ...base, confirmed: true })).toContain("已确认");
  });

  it("已录入价格的采购明细不允许被连带删除", () => {
    expect(getPurchaseOrderCascadeBlockReason({ ...base, pricedItemCount: 2 })).toContain("已录入价格");
  });

  it("已生成物流单的采购订单不允许被连带删除", () => {
    expect(getPurchaseOrderCascadeBlockReason({ ...base, shipmentCount: 1 })).toContain("已生成物流单");
  });
});
