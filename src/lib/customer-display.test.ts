import { describe, expect, it } from "vitest";
import { customerDisplayName, customerDisplaySql } from "./customer-display";

describe("customer display", () => {
  it("prefers the short name and falls back through the master fields", () => {
    expect(customerDisplayName({ shortName: "简称", nameCn: "中文全称", name: "英文全称", customerCode: "C-01" })).toBe("简称");
    expect(customerDisplayName({ shortName: "", nameCn: "中文全称", name: "英文全称", customerCode: "C-01" })).toBe("中文全称");
    expect(customerDisplayName({ shortName: "", nameCn: "", name: "", customerCode: "C-01" })).toBe("C-01");
    expect(customerDisplayName(undefined, "原始引用")).toBe("原始引用");
  });

  it("builds the canonical SQL order with source fallbacks", () => {
    expect(customerDisplaySql("customer", "project.customerName", "project.customerId")).toBe(
      "COALESCE(NULLIF(customer.shortName, ''), NULLIF(customer.nameCn, ''), NULLIF(customer.name, ''), NULLIF(customer.customerCode, ''), NULLIF(project.customerName, ''), NULLIF(project.customerId, ''))",
    );
  });
});
