import { describe, expect, it } from "vitest";
import { MIN_TABLE_VIEWPORT_HEIGHT, computeTableMaxHeight } from "./table-viewport-height";

describe("computeTableMaxHeight", () => {
  it("把超出视口的部分收掉，让整页刚好铺满", () => {
    // 视口 800：表格顶部 200、底部 700（表格 500 高），下方还有 128 的分页条与内边距，
    // 于是整页 828 比视口多 28 —— 正是列表页出现第二根滚动条的原因。
    const height = computeTableMaxHeight({
      viewportTop: 0,
      viewportHeight: 800,
      tableTop: 200,
      tableBottom: 700,
      scrollTop: 0,
      contentHeight: 828,
    });

    expect(height).toBe(472);
    expect(200 + height + 128).toBe(800);
  });

  it("结果与当前滚动位置无关", () => {
    const base = {
      viewportTop: 0,
      viewportHeight: 800,
      scrollTop: 0,
      contentHeight: 828,
    };
    const atTop = computeTableMaxHeight({ ...base, tableTop: 200, tableBottom: 700 });
    // 页面往下滚 28px 后，getBoundingClientRect 的两个坐标同步上移 28px。
    const scrolled = computeTableMaxHeight({ ...base, scrollTop: 28, tableTop: 172, tableBottom: 672 });

    expect(scrolled).toBe(atTop);
  });

  it("表格下方内容很多时不塌成一条缝", () => {
    const height = computeTableMaxHeight({
      viewportTop: 0,
      viewportHeight: 700,
      tableTop: 600,
      tableBottom: 640,
      scrollTop: 0,
      contentHeight: 2400,
    });

    expect(height).toBe(MIN_TABLE_VIEWPORT_HEIGHT);
  });

  it("嵌套滚动容器按容器自身可视区计算", () => {
    // 首页这类布局：滚动的是内层容器（视口坐标 top=88、高 700），不是整个 document。
    const height = computeTableMaxHeight({
      viewportTop: 88,
      viewportHeight: 700,
      tableTop: 288,
      tableBottom: 788,
      scrollTop: 0,
      contentHeight: 788,
    });

    expect(height).toBe(412);
    // 表格顶部相对容器 200，加高度 412，加下方剩余 88，正好等于容器可视高 700。
    expect(288 - 88 + height + 88).toBe(700);
  });

  it("允许自定义下限", () => {
    const height = computeTableMaxHeight({
      viewportTop: 0,
      viewportHeight: 400,
      tableTop: 380,
      tableBottom: 400,
      scrollTop: 0,
      contentHeight: 900,
      minHeight: 320,
    });

    expect(height).toBe(320);
  });
});
