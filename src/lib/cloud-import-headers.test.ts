import { describe, expect, it } from "vitest";
import {
  buildCloudImportFieldMap,
  normalizeCloudImportHeader,
  normalizeCloudInvoiceStatus,
  resolveCloudImportField,
} from "./cloud-import-headers";
import { CLOUD_IMPORT_HEADERS } from "./cloud-service";

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
  "客户开票状态": "collectionInvoice",
  "已收款": "collected",
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

  it("系统自己导出的列能被识别回来", () => {
    expect(resolveCloudImportField("客户开票状态", fields)).toBe("collectionInvoice");
    expect(resolveCloudImportField("已收款", fields)).toBe("collected");
  });

  // 对账模板（业务简化版）的表头必须 100% 能映射，漏一个就等于那列静默丢失。
  it("简化后的对账模板表头全部能识别", () => {
    const templateHeaders = [
      "账期", "客户名称", "华为ID",
      "目录价", "伙伴结算金额", "代金券-客户", "代金券-万众",
      "供应商应付金额（不含税）", "供应商税率", "伙伴税金", "伙伴应还金额（含税）",
      "客户应还金额（不含税）", "客户税率", "客户应还金额（含税）",
      "理论毛利", "结算毛利", "特殊折扣", "备注",
    ];
    // 用线上真实的别名表来校验，避免测试里再维护一份副本而失真。
    const realFields = buildCloudImportFieldMap(CLOUD_IMPORT_HEADERS);
    const unresolved = templateHeaders.filter((header) => !resolveCloudImportField(header, realFields));

    expect(unresolved).toEqual([]);
  });

  it("特殊折扣按文本映射到客户折扣字段", () => {
    const realFields = buildCloudImportFieldMap(CLOUD_IMPORT_HEADERS);

    expect(resolveCloudImportField("特殊折扣", realFields)).toBe("customerDiscount");
  });
});

describe("normalizeCloudInvoiceStatus", () => {
  it("把导出的中文状态换回内部枚举", () => {
    expect(normalizeCloudInvoiceStatus("已开票")).toBe("issued");
    expect(normalizeCloudInvoiceStatus("未开票")).toBe("not_issued");
  });

  it("内部枚举原样透传，空值保持为空", () => {
    expect(normalizeCloudInvoiceStatus("issued")).toBe("issued");
    expect(normalizeCloudInvoiceStatus("not_issued")).toBe("not_issued");
    expect(normalizeCloudInvoiceStatus("")).toBe("");
    expect(normalizeCloudInvoiceStatus(null)).toBe("");
  });
});
