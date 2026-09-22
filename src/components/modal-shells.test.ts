import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "./drawer";
import { Modal } from "./modal";
import { WorkspaceNavigationDialog } from "./workspace-navigation-dialog";
import { CONFIRM_Z_INDEX, TOAST_Z_INDEX } from "./app-dialog";
import { MODAL_Z_INDEX } from "./modal";

describe("shared overlay shells", () => {
  it("renders the modal title, description, body and footer", () => {
    const html = renderToStaticMarkup(
      createElement(
        Modal,
        {
          children: createElement("div", null, "表单内容"),
          description: "说明文字",
          footer: createElement("button", { type: "button" }, "确定"),
          onClose: vi.fn(),
          title: "新建档案",
        },
      ),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("新建档案");
    expect(html).toContain("说明文字");
    expect(html).toContain("表单内容");
    expect(html).toContain("确定");
    expect(html).toContain('aria-label="关闭"');
    expect(html).toContain("z-[100]");
  });

  it("renders the modal panel as a form when panelAs is form", () => {
    const html = renderToStaticMarkup(
      createElement(
        Modal,
        {
          children: createElement("div", null, "字段"),
          onClose: vi.fn(),
          panelAs: "form",
          panelProps: { action: "/submit" },
          title: "编辑档案",
        },
      ),
    );
    expect(html).toContain('<form class="max-h-[88vh] w-full max-w-2xl');
    expect(html).toContain('action="/submit"');
  });

  it("keeps the drawer panel above its backdrop", () => {
    const html = renderToStaticMarkup(
      createElement(
        Drawer,
        {
          children: createElement("div", null, "抽屉内容"),
          description: "副标题",
          onClose: vi.fn(),
          title: "测算",
        },
      ),
    );
    expect(html).toContain('class="fixed inset-0 z-[90] bg-black/40"');
    expect(html).toContain("fixed inset-y-0 right-0 z-[100]");
  });

  it("keeps the workspace navigation dialog on z-[130]", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceNavigationDialog, {
        detail: "PO-1",
        message: "即将跳转",
        onOpen: vi.fn(),
        onStay: vi.fn(),
        title: "切换工作区",
      }),
    );
    expect(html).toContain("z-[130]");
    expect(html).toContain("留在当前页");
    expect(html).toContain("查看明细");
  });

  it("keeps the confirm box and toast above the modal so in-dialog confirmations stay clickable", () => {
    const layerOf = (value: string) => Number(value.replace(/\D/g, ""));
    expect(layerOf(CONFIRM_Z_INDEX)).toBeGreaterThan(layerOf(MODAL_Z_INDEX));
    expect(layerOf(TOAST_Z_INDEX)).toBeGreaterThan(layerOf(CONFIRM_Z_INDEX));
    // 列菜单 80、遮罩 90、弹窗 100 之下的层级不能被确认框/轻提示越过导航（130）
    expect(layerOf(TOAST_Z_INDEX)).toBeLessThan(130);
  });
});
