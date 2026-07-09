import { describe, expect, it } from "vitest";
import {
  applyBillingAdjustmentDeviceAutofill,
  getBillingAdjustmentEditState,
} from "./billing-adjustment-form";

describe("billing adjustment form", () => {
  it("fills model code and english name when device code matches an instance model", () => {
    const item = applyBillingAdjustmentDeviceAutofill(
      { deviceCode: "06114026", modelCode: "", nameEn: "" },
      [
        { deviceCode: "06114026", modelCode: "HV777.0.0.6", nameEn: "Compute Enhanced A" },
        { deviceCode: "DEV-2", modelCode: "M2", nameEn: "Compute B" },
      ],
    );

    expect(item).toMatchObject({
      deviceCode: "06114026",
      modelCode: "HV777.0.0.6",
      nameEn: "Compute Enhanced A",
    });
  });

  it("keeps a saved draft read-only until the user clicks edit", () => {
    expect(getBillingAdjustmentEditState({ isEditing: false, isSaving: false, status: "草稿" })).toMatchObject({
      canEdit: false,
      editButtonLabel: "修改",
      confirmDisabled: false,
    });

    expect(getBillingAdjustmentEditState({ isEditing: true, isSaving: false, status: "草稿" })).toMatchObject({
      canEdit: true,
      editButtonLabel: "保存草稿",
      confirmDisabled: false,
    });
  });

  it("locks confirmed adjustments", () => {
    expect(getBillingAdjustmentEditState({ isEditing: true, isSaving: false, status: "已确认" })).toMatchObject({
      canEdit: false,
      editButtonLabel: "修改",
      editButtonDisabled: true,
      confirmButtonLabel: "已确认",
      confirmDisabled: true,
    });
  });
});
