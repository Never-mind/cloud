import { describe, expect, it } from "vitest";
import {
  HOME_TAB,
  closeWorkspaceTab,
  createInitialWorkspace,
  getEmbeddedRoute,
  getWorkspaceRouteFromLocation,
  getWorkspaceTabTitle,
  normalizeWorkspaceState,
  openWorkspaceTab,
  updateWorkspaceTabRoute,
} from "./tab-workspace";

describe("tab workspace state", () => {
  it("opens a module tab and reuses it when opened again", () => {
    const state = createInitialWorkspace();
    const opened = openWorkspaceTab(state, {
      route: "/finance/billing-statements",
      title: "月账单对账单",
      closable: true,
    });
    const reopened = openWorkspaceTab(opened, {
      route: "/finance/billing-statements",
      title: "月账单对账单",
      closable: true,
    });

    expect(opened.tabs.map((tab) => tab.route)).toEqual(["/", "/finance/billing-statements"]);
    expect(opened.activeRoute).toBe("/finance/billing-statements");
    expect(reopened.tabs).toHaveLength(2);
    expect(reopened.activeRoute).toBe("/finance/billing-statements");
  });

  it("does not close the home tab", () => {
    const state = createInitialWorkspace();

    expect(closeWorkspaceTab(state, "/")).toBe(state);
  });

  it("activates the previous tab when closing the current tab", () => {
    const state = openWorkspaceTab(
      openWorkspaceTab(createInitialWorkspace(), {
        route: "/requests/orders",
        title: "需求单",
        closable: true,
      }),
      {
        route: "/purchase/orders",
        title: "采购订单",
        closable: true,
      },
    );

    const next = closeWorkspaceTab(state, "/purchase/orders");

    expect(next.tabs.map((tab) => tab.route)).toEqual(["/", "/requests/orders"]);
    expect(next.activeRoute).toBe("/requests/orders");
  });

  it("adds embed query for module tabs", () => {
    expect(getEmbeddedRoute("/purchase/orders")).toBe("/purchase/orders?embed=1");
    expect(getEmbeddedRoute("/purchase/orders?status=draft")).toBe("/purchase/orders?status=draft&embed=1");
  });

  it("updates the source tab title after an embedded page changes route", () => {
    const opened = openWorkspaceTab(createInitialWorkspace(), {
      route: "/finance/prepayment-contracts",
      title: "预付款合同",
      closable: true,
    });
    const next = updateWorkspaceTabRoute(
      opened,
      "workspace-route:/finance/prepayment-contracts",
      "/finance/prepayment-contracts/FPA-001",
      "预付款合同明细",
    );

    expect(next.tabs).toHaveLength(2);
    expect(next.tabs[1]).toMatchObject({
      route: "/finance/prepayment-contracts/FPA-001",
      title: "预付款合同明细",
    });
    expect(next.activeRoute).toBe("/finance/prepayment-contracts/FPA-001");
  });

  it("opens a new filtered detail tab while preserving the current tab", () => {
    const opened = openWorkspaceTab(createInitialWorkspace(), {
      route: "/finance/prepayment-contracts/FPA-001",
      title: "预付款合同明细",
      closable: true,
    });
    const next = openWorkspaceTab(opened, {
      route: "/finance/monthly-prepayment-writeoffs?keyword=FPA-001",
      title: "预付款每月核销明细",
      closable: true,
    });

    expect(next.tabs.map((tab) => tab.title)).toEqual(["首页", "预付款合同明细", "预付款每月核销明细"]);
    expect(next.activeRoute).toBe("/finance/monthly-prepayment-writeoffs?keyword=FPA-001");
  });

  it("strips the iframe marker and resolves detail tab titles", () => {
    expect(getWorkspaceRouteFromLocation("/finance/service-fee-snapshot-items", "?snapshotNo=SFC-001&embed=1")).toBe(
      "/finance/service-fee-snapshot-items?snapshotNo=SFC-001",
    );
    expect(getWorkspaceTabTitle("/finance/service-fee-snapshot-items?snapshotNo=SFC-001")).toBe("服务费对账单明细");
    expect(getWorkspaceTabTitle("/finance/billing-statements/BSS-MX-202608")).toBe("月账单对账单明细");
    expect(getWorkspaceTabTitle("/finance/monthly-billing-writeoffs")).toBe("月账单每月明细");
    expect(getWorkspaceTabTitle("/product-catalog/2425373d-9180-470d-8054-e1415ff1bd1b")).toBe("产品主档详情");
    expect(getWorkspaceTabTitle("/suppliers/84699818-259e-4966-9f50-78c0a3a8c475")).toBe("供应商详情");
    expect(getWorkspaceTabTitle("/customers/customer-001")).toBe("客户详情");
    expect(getWorkspaceTabTitle("/undertaking-units/unit-001")).toBe("承接单位详情");
  });

  it("deduplicates routes restored from an older tab session", () => {
    const normalized = normalizeWorkspaceState({
      tabs: [
        HOME_TAB,
        { id: "old-a", route: "/customers", title: "客户管理", closable: true },
        { id: "old-b", route: "/customers", title: "客户管理", closable: true },
      ],
      activeRoute: "/customers",
    });

    expect(normalized.tabs.map((tab) => tab.route)).toEqual(["/", "/customers"]);
    expect(normalized.tabs.map((tab) => tab.id)).toEqual(["workspace-home", "old-a"]);
    expect(normalized.activeRoute).toBe("/customers");
  });
});
