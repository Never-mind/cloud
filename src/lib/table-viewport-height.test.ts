import { describe, expect, it } from "vitest";
import { MIN_TABLE_VIEWPORT_HEIGHT, computeTableMaxHeight, hasCallerHeightControl } from "./table-viewport-height";

describe("列表高度自适应", () => {
  it("内容不足一屏时不压缩（整页不溢出）", () => {
    expect(computeTableMaxHeight({ naturalHeight: 300, overflow: 0 })).toBe(300);
  });

  it("长列表按整页溢出量收口到刚好一屏", () => {
    // 自然高 1200，整页超出 500 → 收到 700
    expect(computeTableMaxHeight({ naturalHeight: 1200, overflow: 500 })).toBe(700);
  });

  it("算出来小于下限时保底，避免表格被压成一条缝", () => {
    expect(computeTableMaxHeight({ naturalHeight: 1200, overflow: 1180 })).toBe(MIN_TABLE_VIEWPORT_HEIGHT);
  });

  it("上方内容占满一屏时不收口，按自然高度放开（项目结算发票管理标签页）", () => {
    // 可视区 800，表格上方 620、下方 160，只剩 20px —— 比下限还小
    const height = computeTableMaxHeight({
      naturalHeight: 900,
      overflow: 1080,
      viewportHeight: 800,
      tableTop: 620,
      contentBelow: 160,
    });
    expect(height).toBe(900);
  });

  it("单表纯列表页仍按剩余空间收口", () => {
    // 可视区 900，表格上方 260、下方 140 → 剩余 500，比自然高度 1200 小，取 500
    const height = computeTableMaxHeight({
      naturalHeight: 1200,
      overflow: 700,
      viewportHeight: 900,
      tableTop: 260,
      contentBelow: 140,
    });
    expect(height).toBe(500);
  });

  it("不放大：剩余空间比内容还多时还是按内容高度", () => {
    const height = computeTableMaxHeight({
      naturalHeight: 260,
      overflow: 0,
      viewportHeight: 900,
      tableTop: 200,
      contentBelow: 120,
    });
    expect(height).toBe(260);
  });
});

describe("调用方自控高度的判断", () => {
  it("h-full / max-h-[...] 这类交给调用方", () => {
    expect(hasCallerHeightControl(["table-scroll", "h-full"])).toBe(true);
    expect(hasCallerHeightControl(["max-h-[320px]"])).toBe(true);
    expect(hasCallerHeightControl(["table-scroll", "overflow-auto"])).toBe(false);
  });
});
