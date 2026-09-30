import { describe, expect, it } from "vitest";
import { crmDateValue, crmValuesEqual, crmMonthToPeriod, normalizeCrmMonth, normalizeCrmPartyName, recentCrmMonths } from "./crm-invoice-sync-service";

describe("normalizeCrmMonth / crmMonthToPeriod", () => {
  it("接受 YYYY-MM 与 YYYYMM", () => {
    expect(normalizeCrmMonth("2026-09")).toBe("2026-09");
    expect(normalizeCrmMonth("202609")).toBe("2026-09");
    expect(crmMonthToPeriod("2026-09")).toBe("202609");
  });

  it("非法月份返回空", () => {
    expect(normalizeCrmMonth("2026-13")).toBe("");
    expect(normalizeCrmMonth("abc")).toBe("");
    expect(normalizeCrmMonth("")).toBe("");
  });
});

describe("normalizeCrmPartyName", () => {
  it("忽略大小写、空格与全角括号", () => {
    expect(normalizeCrmPartyName("Panda pay")).toBe(normalizeCrmPartyName("pandapay"));
    expect(normalizeCrmPartyName("华为云（华为云计算技术有限公司）")).toBe("华为云(华为云计算技术有限公司)");
  });
});

describe("recentCrmMonths", () => {
  it("返回含当月的最近 N 个月", () => {
    expect(recentCrmMonths(3, new Date(2026, 8, 30))).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(recentCrmMonths(1, new Date(2026, 0, 5))).toEqual(["2026-01"]);
  });
});

describe("crmValuesEqual", () => {
  it("日期字段按 YYYY-MM-DD 比，MySQL 返回的 Date 对象也算相等", () => {
    // 驱动把 DATE 取回成 Date 对象，旧实现直接 toString 会永远判成不一致。
    expect(crmValuesEqual("invoiceDate", "2026-07-16", new Date(2026, 6, 16))).toBe(true);
    expect(crmValuesEqual("invoiceDate", "2026-07-16", "2026-07-17")).toBe(false);
  });

  it("金额按数值比，容忍分位误差", () => {
    expect(crmValuesEqual("invoiceTotalAmount", 1062.52, "1062.5200")).toBe(true);
    expect(crmValuesEqual("invoiceTotalAmount", 1062.52, "1062.53")).toBe(false);
  });

  it("币种等文本忽略大小写与空白", () => {
    expect(crmValuesEqual("invoiceCurrency", "USD", " usd ")).toBe(true);
    expect(crmValuesEqual("invoiceCurrency", "USD", "CNY")).toBe(false);
  });
});

describe("crmDateValue", () => {
  it("CRM 字符串与库里 DATE 取回的 Date 对象都能转成 YYYY-MM-DD", () => {
    // 直接 String(Date) 会变成 "Thu Aug 06 2026 ..."，写库时会被存成 NULL
    expect(crmDateValue(new Date(2026, 7, 6))).toBe("2026-08-06");
    expect(crmDateValue("2026-08-06")).toBe("2026-08-06");
    expect(crmDateValue("")).toBeNull();
    expect(crmDateValue(null)).toBeNull();
  });
});
