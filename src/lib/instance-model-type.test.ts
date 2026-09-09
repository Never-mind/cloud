import { describe, expect, it } from "vitest";
import {
  DEFAULT_INSTANCE_MODEL_TYPE,
  formatInstanceModelType,
  normalizeInstanceModelType,
  requireInstanceModelType,
} from "./instance-model-type";

describe("instance model type", () => {
  it("normalizes English and Chinese values to database values", () => {
    expect(normalizeInstanceModelType("Equipment")).toBe("Equipment");
    expect(normalizeInstanceModelType("material")).toBe("Material");
    expect(normalizeInstanceModelType("组件")).toBe("Component");
    expect(normalizeInstanceModelType("", DEFAULT_INSTANCE_MODEL_TYPE)).toBe("Equipment");
  });

  it("rejects unsupported values", () => {
    expect(() => requireInstanceModelType("Spare")).toThrow("实例型号类型只能选择");
  });

  it("formats database values for the Chinese UI", () => {
    expect(formatInstanceModelType("Equipment")).toBe("设备");
    expect(formatInstanceModelType("Material")).toBe("配件");
    expect(formatInstanceModelType("Component")).toBe("组件");
    expect(formatInstanceModelType("legacy")).toBe("legacy");
  });
});
