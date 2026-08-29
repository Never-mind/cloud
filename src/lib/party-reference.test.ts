import { describe, expect, it } from "vitest";
import { getPartyReferenceLabel, normalizePartyReferenceRow, resolvePartyReference } from "./party-reference";

describe("party references", () => {
  const suppliers = [
    { supplierId: "supplier-uuid", supplierCode: "supply01", shortName: "供应商简称", nameCn: "供应商全称" },
  ];

  it("resolves a code to the stored public party id", () => {
    expect(resolvePartyReference("supply01", suppliers, ["supplierId"], ["supplierCode", "shortName", "nameCn"])).toBe("supplier-uuid");
  });

  it("returns the short name and code for picker display", () => {
    expect(getPartyReferenceLabel(suppliers[0], ["supplierCode"])).toEqual({ code: "supply01", shortName: "供应商简称" });
  });

  it("normalizes imported party codes and UUIDs to stored IDs", () => {
    const references = {
      suppliers: [{ supplierId: "supplier-uuid", supplierCode: "supply01", shortName: "HT98" }],
      undertakingUnits: [{ undertakingUnitId: "unit-uuid", undertakingUnitCode: "BRGS01", shortName: "Z071QN_0" }],
      customers: [{ customerId: "customer-uuid", customerCode: "huawei01", shortName: "华为（巴西）" }],
    };
    const row = { supplierId: "supply01", undertakingUnitId: "BRGS01", customerId: "customer-uuid" };

    expect(normalizePartyReferenceRow(row, references)).toBe("");
    expect(row).toEqual({ supplierId: "supplier-uuid", undertakingUnitId: "unit-uuid", customerId: "customer-uuid" });
  });

  it("reports an unknown imported party reference", () => {
    const error = normalizePartyReferenceRow(
      { supplierId: "missing-supplier" },
      { suppliers: [], undertakingUnits: [], customers: [] },
    );

    expect(error).toBe("供应商不存在：missing-supplier");
  });
});
