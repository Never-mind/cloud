import { describe, expect, it } from "vitest";
import {
  closeWorkspaceTab,
  createInitialWorkspace,
  getEmbeddedRoute,
  openWorkspaceTab,
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
});
