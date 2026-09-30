import { describe, expect, it } from "vitest";
import { preferLivePartyName } from "./cloud-service";

/**
 * 华为云对账行的付款方 / 收款方文本只是"保存当时"的档案名称快照。
 * 这里守住替换规则：只有这一格存的确实是那份快照时才换成档案当前名称，
 * 手工或导入填的其它往来方不能被冲掉。
 */
describe("preferLivePartyName", () => {
  it("空值用当前名称补齐", () => {
    expect(preferLivePartyName("", "旧简称", "新简称")).toBe("新简称");
    expect(preferLivePartyName(null, "旧简称", "新简称")).toBe("新简称");
  });

  it("存的就是映射表里的旧名称时，替换成档案当前名称", () => {
    expect(preferLivePartyName("OTOMORIA", "OTOMORIA", "Hengshan")).toBe("Hengshan");
  });

  it("手工或导入填的其它往来方保持原样", () => {
    expect(preferLivePartyName("香港万众", "OTOMORIA", "Hengshan")).toBe("香港万众");
    expect(preferLivePartyName("panda pay", "OTOMORIA", "Hengshan")).toBe("panda pay");
  });

  it("档案查不到当前名称时不改动原值", () => {
    expect(preferLivePartyName("OTOMORIA", "OTOMORIA", "")).toBe("OTOMORIA");
  });
});
