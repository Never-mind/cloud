import { describe, expect, it } from "vitest";
import { getPurchaseSourceRequestNos } from "./purchase-order-sources";

describe("purchase order source numbers", () => {
  it("shows every saved source even when the legacy header contains only the first", () => {
    expect(getPurchaseSourceRequestNos({ requestNo: "REQ-A", sourceRequestNos: "REQ-A,REQ-B" }))
      .toBe("REQ-A,REQ-B");
  });

  it("recovers missing legacy metadata from items and removes empty/duplicate sources", () => {
    expect(getPurchaseSourceRequestNos({ requestNo: "REQ-A", sourceRequestNos: " REQ-A, " },
      ["REQ-A", "REQ-B", " REQ-B ", null, "", "REQ-C"]))
      .toBe("REQ-A,REQ-B,REQ-C");
  });

  it("keeps single-source orders unchanged and supports empty drafts", () => {
    expect(getPurchaseSourceRequestNos({ requestNo: "REQ-A" }, ["REQ-A", "REQ-A"])).toBe("REQ-A");
    expect(getPurchaseSourceRequestNos({})).toBe("");
  });

  it("does not display free-text historical headers as an extra source", () => {
    expect(getPurchaseSourceRequestNos({ requestNo: "REQ-A REQ-B", sourceRequestNos: "REQ-A" }, ["REQ-B", "REQ-A"]))
      .toBe("REQ-A,REQ-B");
  });

  it("does not truncate orders with many source numbers", () => {
    const sources = Array.from({ length: 150 }, (_, index) => `REQ-202610-${String(index).padStart(4, "0")}`);
    expect(getPurchaseSourceRequestNos({ requestNo: sources[0] }, sources).split(",")).toEqual(sources);
  });
});
