import { describe, expect, it } from "vitest";
import { collectionCurrency, collectionStatus, collectionUsdAmount } from "./cloud-collection";

describe("华为云收款币种折算", () => {
  it("CNY 按汇率折合 USD", () => {
    const row = { collectionCurrency: "CNY", collectionTotalAmount: 7000, collectionExchangeRate: 7 };
    expect(collectionCurrency(row)).toBe("CNY");
    expect(collectionUsdAmount(row)).toBe(1000);
  });

  it("USD 不做二次换算", () => {
    expect(collectionUsdAmount({ collectionCurrency: "USD", collectionTotalAmount: 1234.56 })).toBe(1234.56);
  });

  it("非 USD 且没有汇率时不把原币当 USD", () => {
    expect(collectionUsdAmount({ collectionCurrency: "MXN", collectionTotalAmount: 5000 })).toBeNull();
  });

  it("收款状态按 collected 和原币金额判断", () => {
    expect(collectionStatus({ collected: 1, collectionTotalAmount: 0 })).toBe("paid");
    expect(collectionStatus({ collected: 0, collectionTotalAmount: 100 })).toBe("partial");
    expect(collectionStatus({ collected: 0, collectionTotalAmount: 0 })).toBe("open");
  });

  it("原币折合 USD 已覆盖应收时视为已收款", () => {
    expect(collectionStatus({
      collected: 0,
      customerReceivableTotalAmount: 1000,
      collectionCurrency: "CNY",
      collectionExchangeRate: 7,
      collectionTotalAmount: 7000,
    })).toBe("paid");
  });
});
