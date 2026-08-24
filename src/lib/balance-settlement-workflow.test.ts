import { describe, expect, it } from "vitest";
import { calculateBalanceSettlement } from "./balance-settlement-service";

describe("balance settlement calculation", () => {
  it("matches the Brazil CAPEX/OPEX worksheet calculation", () => {
    expect(calculateBalanceSettlement({
      quantity: 11, purchaseCapexUnitPrice: 9193.5049990673, purchaseOpexUnitPrice: 9301.11639342066,
      settlementRate: 1, anchorCapexUnitPrice: 9428.152555, anchorOpexUnitPrice: 8070.498587,
    })).toMatchObject({
      capexDifferenceUnitPrice: -234.6476, capexDifferenceTotal: -2581.1231,
      opexDifferenceUnitPrice: 1230.6178, opexDifferenceTotal: 13536.7959, differenceTotal: 10955.6728,
    });
  });

  it("keeps zero OPEX as a valid procurement allocation", () => {
    expect(calculateBalanceSettlement({
      quantity: 80, purchaseCapexUnitPrice: 8886.08067796464, purchaseOpexUnitPrice: 0,
      settlementRate: 1, anchorCapexUnitPrice: 8655.28645802817, anchorOpexUnitPrice: 173.11,
    })).toMatchObject({ capexDifferenceTotal: 18463.5376, opexDifferenceTotal: -13848.8, differenceTotal: 4614.7376 });
  });

  it("rejects an empty or zero settlement exchange rate", () => {
    expect(() => calculateBalanceSettlement({ settlementRate: 0 })).toThrow("结差汇率必须大于0");
  });
});
