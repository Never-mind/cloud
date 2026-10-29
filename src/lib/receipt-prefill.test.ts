import { describe, expect, it } from "vitest";
import { prefillReceiptFromSource } from "./receipt-prefill";

describe("receipt prefill", () => {
  it("fills blank receipt fields from the selected source without replacing existing values", () => {
    expect(prefillReceiptFromSource(
      { currency: "", net: "", rate: "", total: "", tax: "" },
      { currency: "USD", net: 100, rate: 0.13, total: 113, tax: 13 },
    )).toEqual({ currency: "USD", net: "100", rate: "0.13", total: "113", tax: "13" });

    expect(prefillReceiptFromSource(
      { currency: "USD", net: 80, rate: "", total: "", tax: 0 },
      { currency: "USD", net: 100, rate: 0.13, total: 113, tax: 13 },
    )).toEqual({ currency: "USD", net: "80", rate: "0.13", total: "113", tax: "0" });
  });

  it("derives tax from net and total when the source has no tax field", () => {
    expect(prefillReceiptFromSource(
      {},
      { currency: "USD", net: 100, rate: 0.13, total: 113 },
    ).tax).toBe("13");
  });

  it("does not copy amounts across a currency mismatch", () => {
    expect(prefillReceiptFromSource(
      { currency: "CNY", net: "", rate: "", total: "", tax: "" },
      { currency: "USD", net: 100, rate: 0.13, total: 113, tax: 13 },
    )).toEqual({ currency: "CNY", net: "", rate: "", total: "", tax: "" });
  });
});
