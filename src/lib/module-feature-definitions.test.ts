import { describe, expect, it } from "vitest";
import {
  getDefaultModuleFeatureState,
  getModuleFeatureDomainKey,
  isModuleDisabledByDefault,
} from "./module-feature-definitions";

describe("module feature domains", () => {
  it("keeps product, cloud, common, and power menus in separate domains", () => {
    expect(getModuleFeatureDomainKey("算力系统")).toBe("power");
    expect(getModuleFeatureDomainKey("集采系统")).toBe("po");
    expect(getModuleFeatureDomainKey("客户PO")).toBe("po");
    expect(getModuleFeatureDomainKey("华为云业务")).toBe("cloud");
    expect(getModuleFeatureDomainKey("公共区域")).toBe("common");
    expect(getModuleFeatureDomainKey("数据工具")).toBe("common");
    expect(getModuleFeatureDomainKey("财务管理")).toBe("power");
  });

  it("keeps disabled-by-default power features disabled", () => {
    const state = getDefaultModuleFeatureState();
    expect(isModuleDisabledByDefault("internal-service-fees")).toBe(true);
    expect(state["internal-service-fees"]).toBe(false);
    expect(state["system-module-features"]).toBeUndefined();
  });
});
