import { describe, expect, it } from "vitest";
import { isWriteOffBalanced, WRITE_OFF_BALANCE_TOLERANCE } from "./prepayment-writeoff-balance";

describe("预付款核销平衡容差", () => {
  it("容差为业务确认的 3", () => {
    expect(WRITE_OFF_BALANCE_TOLERANCE).toBe(3);
  });

  it("完全平衡与 24 期均摊尾差都算已平", () => {
    for (const gap of [0, 0.01, -0.09, 0.007999, 1, -2.99, 3, -3]) {
      expect(isWriteOffBalanced(gap)).toBe(true);
    }
  });

  it("超过容差才算未平", () => {
    for (const gap of [3.01, -3.01, 972.81, -1000, 112619.55]) {
      expect(isWriteOffBalanced(gap)).toBe(false);
    }
  });

  it("先四舍五入到分再比较，避免浮点噪声误判", () => {
    expect(isWriteOffBalanced(3.004)).toBe(true);
    expect(isWriteOffBalanced(3.006)).toBe(false);
  });
});
