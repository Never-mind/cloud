import { describe, expect, it } from "vitest";
import {
  isEquipmentPartNo,
  materialSyncBlockMessage,
  resolveMaterialSyncTarget,
  type RemoteMaterial,
} from "./material-sync-service";
import { getEntityConfig } from "./modules";

function material(overrides: Partial<RemoteMaterial>): RemoteMaterial {
  return {
    name: "MAT-00001",
    materialType: "",
    customerPartNo: "",
    customerItemCode: "",
    model: "",
    materialCode: "",
    nameZh: "",
    ...overrides,
  };
}

describe("instance model remote sync rules", () => {
  it("builds Equipment records from the 06/99 customer part no", () => {
    expect(resolveMaterialSyncTarget(material({ materialType: "Equipment", customerPartNo: "06113690", customerItemCode: "SL061100002498" })))
      .toEqual({ ok: true, instanceType: "Equipment", deviceCode: "06113690", alternateCode: "SL061100002498" });
    expect(resolveMaterialSyncTarget(material({ materialType: "Equipment", customerPartNo: "99000001" })))
      .toMatchObject({ ok: true, instanceType: "Equipment", deviceCode: "99000001" });
  });

  it("blocks Equipment rows whose part no is missing or not 06/99 prefixed", () => {
    expect(resolveMaterialSyncTarget(material({ materialType: "Equipment", customerPartNo: "" })))
      .toEqual({ ok: false, reason: "missing-part-no", instanceType: "Equipment" });
    expect(resolveMaterialSyncTarget(material({ materialType: "Equipment", customerPartNo: "06200490_B62" })))
      .toMatchObject({ ok: true });
    expect(resolveMaterialSyncTarget(material({ materialType: "Equipment", customerPartNo: "12345678" })))
      .toEqual({ ok: false, reason: "invalid-part-no", instanceType: "Equipment" });
    expect(isEquipmentPartNo("06113690")).toBe(true);
    expect(isEquipmentPartNo("99000001")).toBe(true);
    expect(isEquipmentPartNo("12345678")).toBe(false);
    expect(isEquipmentPartNo("")).toBe(false);
  });

  it("builds Component and Material records from the customer item code", () => {
    expect(resolveMaterialSyncTarget(material({ materialType: "Component", customerItemCode: "SL062000112000", customerPartNo: "06200490" })))
      .toEqual({ ok: true, instanceType: "Component", deviceCode: "SL062000112000", alternateCode: "06200490" });
    expect(resolveMaterialSyncTarget(material({ materialType: "Material", customerItemCode: "SL064100074292" })))
      .toEqual({ ok: true, instanceType: "Material", deviceCode: "SL064100074292", alternateCode: "" });
    // 不强制 SL 前缀，按远端数据建档。
    expect(resolveMaterialSyncTarget(material({ materialType: "Material", customerItemCode: "X-001" })))
      .toMatchObject({ ok: true, instanceType: "Material", deviceCode: "X-001" });
    expect(resolveMaterialSyncTarget(material({ materialType: "Component", customerItemCode: "" })))
      .toEqual({ ok: false, reason: "missing-item-code", instanceType: "Component" });
  });

  it("rejects remote types outside Equipment/Component/Material", () => {
    expect(resolveMaterialSyncTarget(material({ materialType: "Spare", customerItemCode: "SL1" })))
      .toEqual({ ok: false, reason: "unsupported-type", instanceType: null });
    expect(resolveMaterialSyncTarget(material({ materialType: "", customerItemCode: "SL1" })))
      .toEqual({ ok: false, reason: "unsupported-type", instanceType: null });
  });

  it("matches the remote type case-insensitively", () => {
    expect(resolveMaterialSyncTarget(material({ materialType: "equipment", customerPartNo: "06113690" })))
      .toMatchObject({ ok: true, instanceType: "Equipment" });
    expect(resolveMaterialSyncTarget(material({ materialType: "component", customerItemCode: "SL1" })))
      .toMatchObject({ ok: true, instanceType: "Component" });
  });

  it("tells the user to maintain the remote part no before syncing", () => {
    const message = materialSyncBlockMessage(material({ materialType: "Equipment", name: "MAT-00049" }), "missing-part-no");
    expect(message).toContain("Customer Part No.");
    expect(message).toContain("06 或 99");
    expect(message).toContain("远端");
    expect(materialSyncBlockMessage(material({ materialType: "Equipment", customerPartNo: "12345678" }), "invalid-part-no"))
      .toContain("12345678");
  });

  it("no longer forces a Chinese name so synced Component/Material rows can be edited", () => {
    const config = getEntityConfig("instance-models");
    expect(config?.formFields.find((field) => field.key === "nameZh")?.required).toBeFalsy();
    // 类型本身仍然是必填项。
    expect(config?.formFields.find((field) => field.key === "instanceType")?.required).toBe(true);
  });
});
