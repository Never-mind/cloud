import { describe, expect, it } from "vitest";
import {
  formatNumericInputValue,
  normalizeNumericInputText,
  numericInputDisplayValue,
  parseNumericInputValue,
} from "./numeric-input";

describe("numeric input helpers", () => {
  it("shows zero as blank so typing a number does not keep a leading zero", () => {
    expect(formatNumericInputValue(0)).toBe("");
    expect(formatNumericInputValue(null)).toBe("");
    expect(formatNumericInputValue(undefined)).toBe("");
  });

  it("parses numeric text and removes leading zeroes through numeric conversion", () => {
    expect(parseNumericInputValue("00012.30")).toBe(12.3);
    expect(parseNumericInputValue("")).toBe(0);
  });
});

describe("numeric input typing behaviour", () => {
  it("strips leading zeroes but keeps in-progress decimals", () => {
    expect(normalizeNumericInputText("088")).toBe("88");
    expect(normalizeNumericInputText("00.5")).toBe("0.5");
    expect(normalizeNumericInputText("-007")).toBe("-7");
    expect(normalizeNumericInputText("")).toBe("");
    // 小于 1 的汇率必须能逐个字符敲出来：0 -> 0. -> 0.0 -> 0.05 -> 0.057
    expect(normalizeNumericInputText("0")).toBe("0");
    expect(normalizeNumericInputText("0.")).toBe("0.");
    expect(normalizeNumericInputText("0.0")).toBe("0.0");
    expect(normalizeNumericInputText("0.057")).toBe("0.057");
  });

  it("shows zero as blank so 88 does not become 088", () => {
    expect(numericInputDisplayValue(0)).toBe("");
    expect(numericInputDisplayValue("0")).toBe("");
    expect(numericInputDisplayValue(null)).toBe("");
    expect(numericInputDisplayValue(undefined)).toBe("");
    expect(numericInputDisplayValue(88)).toBe("88");
    expect(numericInputDisplayValue("0.057")).toBe("0.057");
    expect(numericInputDisplayValue("0012.30")).toBe("12.30");
  });
});
