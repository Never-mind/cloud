import { describe, expect, it } from "vitest";
import { getInstanceContractModelAutofill } from "./instance-contract-form";

describe("instance contract form", () => {
  it("fills model code and english instance name from device code", () => {
    expect(
      getInstanceContractModelAutofill("06114026", [
        {
          deviceCode: "06114026",
          modelCode: "HV777.0.0.6",
          nameEn: "Compute Enhanced A",
        },
      ]),
    ).toEqual({
      modelCode: "HV777.0.0.6",
      instanceModelEn: "Compute Enhanced A",
    });
  });

  it("returns empty values when device code is unknown", () => {
    expect(getInstanceContractModelAutofill("UNKNOWN", [])).toEqual({
      modelCode: "",
      instanceModelEn: "",
    });
  });
});
