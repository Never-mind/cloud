import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Panel } from "./ui";

/**
 * Tailwind 的 display 工具类在样式表里是按固定顺序排的，`flow-root` 排在 `flex` 之后，
 * 所以同一个元素上同时出现这两个类时，`display: flow-root` 会顶掉 `display: flex`。
 * Panel 允许调用方用 className 传入布局（华为云对账就是 `flex min-h-0 flex-1 flex-col`），
 * 基础类名里一旦混进 display 工具类，整页布局就会塌掉 —— 这里把它钉住。
 */
const DISPLAY_UTILITIES = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "table",
  "inline-table",
  "flow-root",
  "grid",
  "inline-grid",
  "contents",
  "list-item",
  "hidden",
]);

function renderPanelClassNames(className?: string) {
  const html = renderToStaticMarkup(createElement(Panel, { children: "内容", className }));
  return (html.match(/^<div class="([^"]+)"/)?.[1] ?? "").split(/\s+/).filter(Boolean);
}

describe("Panel", () => {
  it("基础类名里不含 display 工具类，避免顶掉调用方的 flex/grid 布局", () => {
    expect(renderPanelClassNames().filter((name) => DISPLAY_UTILITIES.has(name))).toEqual([]);
  });

  it("原样保留调用方传入的布局类名", () => {
    const classNames = renderPanelClassNames("flex min-h-0 flex-1 flex-col");

    expect(classNames).toEqual(expect.arrayContaining(["flex", "min-h-0", "flex-1", "flex-col"]));
  });

  it("用 overflow-clip 裁切：overflow-hidden 会让 Panel 变成滚动容器，内部 sticky 吸底会失效", () => {
    const classNames = renderPanelClassNames();

    expect(classNames).toContain("overflow-clip");
    expect(classNames).not.toContain("overflow-hidden");
  });
});
