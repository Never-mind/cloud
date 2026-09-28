import { describe, expect, it } from "vitest";
import { buildCloudImportFieldMap, normalizeCloudImportHeader, resolveCloudImportField } from "./cloud-import-headers";

// 与 cloud-service 里的别名表保持同样的关键写法（这里只取易出错的几列）。
const ALIASES: Record<string, string> = {
  "账期": "period",
  "目录价（USD）": "catalogAmount",
  "万众理论毛利（USD）": "theoreticalGrossProfit",
  "万众结算毛利（USD）": "settlementGrossProfit",
  theoreticalgrossprofit: "theoreticalGrossProfit",
  settlementgrossprofit: "settlementGrossProfit",
  "供应商应付（不含税）": "supplierPayableNetAmount",
  "供应商应付（含税）": "supplierPayableTotalAmount",
  "备注": "remark",
};

const fields = buildCloudImportFieldMap(ALIASES);

describe("normalizeCloudImportHeader", () => {
  it("抹平大小写、空格与全/半角括号", () => {
    expect(normalizeCloudImportHeader("万众结算毛利（USD）")).toBe("万众结算毛利");
    expect(normalizeCloudImportHeader("万众结算毛利(USD)")).toBe("万众结算毛利");
    expect(normalizeCloudImportHeader("万众结算毛利 (usd) ")).toBe("万众结算毛利");
  });

  it("保留括号里的非币种说明", () => {
    expect(normalizeCloudImportHeader("供应商应付（含税）")).toBe("供应商应付(含税)");
    expect(normalizeCloudImportHeader("供应商应付（不含税）")).toBe("供应商应付(不含税)");
  });
});

describe("resolveCloudImportField", () => {
  it("模板里的标准写法能对上", () => {
    expect(resolveCloudImportField("万众结算毛利（USD）", fields)).toBe("settlementGrossProfit");
    expect(resolveCloudImportField("目录价（USD）", fields)).toBe("catalogAmount");
  });

  it("括号或大小写写法不同也能对上（以前会静默丢列）", () => {
    expect(resolveCloudImportField("万众结算毛利(USD)", fields)).toBe("settlementGrossProfit");
    expect(resolveCloudImportField("万众结算毛利 (usd)", fields)).toBe("settlementGrossProfit");
    expect(resolveCloudImportField("万众结算毛利", fields)).toBe("settlementGrossProfit");
    expect(resolveCloudImportField("万众理论毛利(USD)", fields)).toBe("theoreticalGrossProfit");
  });

  it("含税/不含税两列不会被归一化串到一起", () => {
    expect(resolveCloudImportField("供应商应付（不含税）", fields)).toBe("supplierPayableNetAmount");
    expect(resolveCloudImportField("供应商应付（含税）", fields)).toBe("supplierPayableTotalAmount");
  });

  it("认不出来的列返回 null，供导入结果提示用户", () => {
    expect(resolveCloudImportField("结算毛利", fields)).toBeNull();
    expect(resolveCloudImportField("随便一列", fields)).toBeNull();
  });
});
