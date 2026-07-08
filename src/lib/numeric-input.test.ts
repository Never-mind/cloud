import { describe, expect, it } from "vitest";
import { formatNumericInputValue, parseNumericInputValue } from "./numeric-input";

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
