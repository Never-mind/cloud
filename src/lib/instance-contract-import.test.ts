import { describe, expect, it } from "vitest";
import { autofillInstanceContractImportRow } from "./instance-contract-import";

describe("instance contract import", () => {
  it("derives model fields from the device code", () => {
    expect(
      autofillInstanceContractImportRow(
        { deviceCode: "DEV-A", modelCode: "", instanceModelEn: "" },
        [{ deviceCode: "DEV-A", modelCode: "M-A", nameEn: "Compute Enhanced" }],
      ),
    ).toMatchObject({ modelCode: "M-A", instanceModelEn: "Compute Enhanced" });
  });

  it("keeps model fields explicitly provided in the import file", () => {
    expect(
      autofillInstanceContractImportRow(
        { deviceCode: "DEV-MISSING", modelCode: "MANUAL-MODEL", instanceModelEn: "Manual Instance" },
        [],
      ),
    ).toMatchObject({ modelCode: "MANUAL-MODEL", instanceModelEn: "Manual Instance" });
  });
});
