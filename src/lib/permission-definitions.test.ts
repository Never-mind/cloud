import { describe, expect, it } from "vitest";
import {
  getPermissionDefinitions,
  getPermissionParentKeys,
  getRoutePermission,
  hasPermission,
  permissionMask,
} from "./permission-definitions";
import { decodePermissionState, encodePermissionState } from "./permission-cookie";

describe("permission definitions", () => {
  it("maps API methods to module actions", () => {
    expect(getRoutePermission("/api/entities/customers", "GET")).toEqual({ moduleKey: "customers", action: "view" });
    expect(getRoutePermission("/api/entities/customers/1", "PUT")).toEqual({ moduleKey: "customers", action: "update" });
    expect(getRoutePermission("/api/entities/customers/export", "GET")).toEqual({ moduleKey: "customers", action: "export" });
    expect(getRoutePermission("/api/cloud/mappings", "POST")).toEqual({ moduleKey: "huawei-cloud-mappings", action: "create" });
    expect(getRoutePermission("/api/cloud/supplier-payments/1", "PATCH")).toEqual({ moduleKey: "huawei-cloud-supplier-payments", action: "update" });
    expect(getRoutePermission("/api/po/quotations/1/confirm", "POST")).toEqual({ moduleKey: "quotations", action: "confirm" });
    expect(getRoutePermission("/product-catalog/models", "GET")).toEqual({ moduleKey: "product-models", action: "view" });
    expect(getRoutePermission("/product-catalog/2425373d-9180-470d-8054-e1415ff1bd1b", "GET")).toEqual({ moduleKey: "product-masters", action: "view" });
    expect(getRoutePermission("/suppliers/84699818-259e-4966-9f50-78c0a3a8c475", "GET")).toEqual({ moduleKey: "suppliers", action: "view" });
    expect(getRoutePermission("/customers/customer-001", "GET")).toEqual({ moduleKey: "customers", action: "view" });
    expect(getRoutePermission("/undertaking-units/unit-001", "GET")).toEqual({ moduleKey: "undertaking-units", action: "view" });
    expect(getRoutePermission("/purchase/order-plan-items", "GET")).toEqual({ moduleKey: "purchase-order-plan-items", action: "view" });
    expect(getRoutePermission("/quotation/items", "GET")).toEqual({ moduleKey: "quotation-items", action: "view" });
  });

  it("allows a parent directory grant to flow to child modules", () => {
    const state = { role: "user", grants: { "domain:business-partners": permissionMask({ canView: true, canUpdate: true }) } };
    expect(getPermissionParentKeys("customers")).toContain("domain:business-partners");
    expect(hasPermission(state, "customers", "view")).toBe(true);
    expect(hasPermission(state, "customers", "delete")).toBe(false);
  });

  it("keeps each business-partner directory independent", () => {
    const state = { role: "user", grants: { "group:domain:business-partners:客户管理": permissionMask({ canView: true }) } };
    expect(getPermissionParentKeys("customers")).toEqual([
      "group:domain:business-partners:客户管理",
      "domain:business-partners",
    ]);
    expect(hasPermission(state, "customers", "view")).toBe(true);
    expect(hasPermission(state, "suppliers", "view")).toBe(false);
    expect(hasPermission(state, "customers", "update")).toBe(false);

    const definitions = getPermissionDefinitions([
      { key: "customers", title: "客户管理", navGroup: "业务伙伴" },
    ]);
    expect(definitions.at(-2)).toMatchObject({ moduleKey: "group:domain:business-partners:客户管理", level: 2, parentKey: "domain:business-partners" });
    expect(definitions.at(-1)).toMatchObject({ moduleKey: "customers", parentKey: "group:domain:business-partners:客户管理", level: 3 });
  });

  it("never exposes administrator-only modules to ordinary users", () => {
    const state = { role: "user", grants: { "system-users": 127 } };
    expect(hasPermission(state, "system-users", "view")).toBe(false);
    expect(hasPermission({ role: "admin", grants: {} }, "system-users", "view")).toBe(true);
  });

  it("round-trips a signed state and rejects tampering", () => {
    const encoded = encodePermissionState({ role: "user", grants: { customers: 1 } });
    expect(decodePermissionState(encoded)).toEqual({ role: "user", grants: { customers: 1 } });
    expect(decodePermissionState(`${encoded}x`)).toBeNull();
  });

  it("includes first, second and third-level permission entries", () => {
    const definitions = getPermissionDefinitions([
      { key: "customers", title: "客户管理", navGroup: "基础信息" },
    ]);
    expect(definitions.map((item) => item.level)).toEqual([1, 1, 1, 1, 1, 1, 2, 3]);
    expect(definitions.at(-1)).toMatchObject({ moduleKey: "customers", parentKey: "group:domain:business-partners:客户管理", level: 3 });
  });

  it("orders permission rows by the sidebar hierarchy", () => {
    const definitions = getPermissionDefinitions([
      { key: "countries", title: "国家管理", navGroup: "基础信息" },
      { key: "requests", title: "需求单", navGroup: "客户需求" },
      { key: "request-items", title: "需求明细一览", navGroup: "客户需求" },
      { key: "system-users", title: "账户管理", navGroup: "用户管理" },
      { key: "system-module-features", title: "功能启用", navGroup: "用户管理" },
      { key: "suppliers", title: "供应商管理", navGroup: "业务伙伴" },
    ]);
    const titles = definitions.map((definition) => definition.title);

    expect(titles.slice(0, 6)).toEqual(["算力系统", "集采系统", "华为云业务", "业务伙伴", "用户管理", "公共功能"]);
    expect(titles.indexOf("客户需求")).toBeLessThan(titles.indexOf("基础信息"));
    expect(titles.indexOf("需求单")).toBeLessThan(titles.indexOf("需求明细一览"));
    expect(titles.indexOf("功能启用")).toBeLessThan(titles.indexOf("账户管理"));
    expect(titles.indexOf("业务伙伴")).toBeLessThan(titles.indexOf("用户管理"));
  });
});
