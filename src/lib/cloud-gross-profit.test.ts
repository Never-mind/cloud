import { describe, expect, it } from "vitest";
import { computeCloudSettlementGrossProfit } from "./cloud-gross-profit";

describe("computeCloudSettlementGrossProfit", () => {
  it("按 客户应收（不含税） − 供应商应付（不含税） 计算", () => {
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: 127305.24, supplierPayableNet: 114053.9221 })).toBe(13251.3179);
  });

  it("字符串数字（导入文件里很常见）同样能算", () => {
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: "2184.2400", supplierPayableNet: "71.4505" })).toBe(2112.7895);
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: "1,234.50", supplierPayableNet: "234.50" })).toBe(1000);
  });

  it("允许为负（应付大于应收）", () => {
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: 100, supplierPayableNet: 180.5 })).toBe(-80.5);
  });

  it("缺任一金额返回 null，交给调用方决定兜底值", () => {
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: 100, supplierPayableNet: null })).toBeNull();
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: "", supplierPayableNet: 10 })).toBeNull();
    expect(computeCloudSettlementGrossProfit({ customerReceivableNet: "abc", supplierPayableNet: 10 })).toBeNull();
  });
});
