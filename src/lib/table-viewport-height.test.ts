import { describe, expect, it } from "vitest";
import { MIN_TABLE_VIEWPORT_HEIGHT, computeTableMaxHeight, hasCallerHeightControl } from "./table-viewport-height";

describe("computeTableMaxHeight", () => {
  it("只收掉超出视口的部分，整页刚好铺满", () => {
    // 放开后表格自然高 1000，整页比视口多 538 —— 收回 538 后表格 462，正好一屏。
    const height = computeTableMaxHeight({ naturalHeight: 1000, overflow: 538 });

    expect(height).toBe(462);
  });

  it("短内容（整页没超出一屏）不被压缩", () => {
    // min-h-screen 会把 scrollHeight 撑满到视口高度，但溢出量为 0，此时不应收口。
    expect(computeTableMaxHeight({ naturalHeight: 180, overflow: 0 })).toBe(MIN_TABLE_VIEWPORT_HEIGHT);
    expect(computeTableMaxHeight({ naturalHeight: 600, overflow: 0 })).toBe(600);
  });

  it("溢出量为负数（内容不足一屏且未撑满）按 0 处理", () => {
    expect(computeTableMaxHeight({ naturalHeight: 600, overflow: -120 })).toBe(600);
  });

  it("表格下方还有很多内容时不塌成一条缝", () => {
    // 一页挂两张表：下方内容把溢出量顶得比表格还高。
    expect(computeTableMaxHeight({ naturalHeight: 1000, overflow: 2000 })).toBe(MIN_TABLE_VIEWPORT_HEIGHT);
  });

  it("允许自定义下限", () => {
    expect(computeTableMaxHeight({ naturalHeight: 1000, overflow: 2000, minHeight: 320 })).toBe(320);
  });

  it("小数结果向上取整，避免比可用空间大 1px 又撑出滚动条", () => {
    expect(computeTableMaxHeight({ naturalHeight: 1000.4, overflow: 538.2 })).toBe(463);
  });
});

describe("hasCallerHeightControl", () => {
  it("识别 h-full / h-[...] / max-h-[...]", () => {
    expect(hasCallerHeightControl(["table-scroll", "h-full", "w-full"])).toBe(true);
    expect(hasCallerHeightControl(["table-scroll", "max-h-[320px]", "overflow-auto"])).toBe(true);
    expect(hasCallerHeightControl(["table-scroll", "[height:400px]"])).toBe(true);
  });

  it("普通列表容器不受影响", () => {
    expect(hasCallerHeightControl(["table-scroll", "table-viewport", "overflow-auto"])).toBe(false);
    expect(hasCallerHeightControl(["table-scroll", "min-w-0", "border"])).toBe(false);
  });
});
