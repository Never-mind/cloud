import { describe, expect, it } from "vitest";
import { formatDateInputValue, formatDisplayValue } from "./display-format";

describe("display format", () => {
  it("formats date and datetime values as date only", () => {
    expect(formatDisplayValue("2026-07-01", "date")).toBe("2026-07-01");
    expect(formatDisplayValue("2026-07-01T13:45:20.000Z", "datetime")).toBe("2026-07-01");
    expect(formatDisplayValue("2026-06-30T16:00:00.000Z", "date")).toBe("2026-07-01");
    expect(formatDisplayValue("2026-07-01 13:45:20")).toBe("2026-07-01");
  });

  it("keeps number formatting unchanged", () => {
    expect(formatDisplayValue(1234.56789)).toBe("1,234.5679");
    expect(formatDisplayValue(1234.56789, "number")).toBe("1,234.5679");
  });

  it("formats financial amounts with exactly two decimal places", () => {
    expect(formatDisplayValue(100, "money")).toBe("100.00");
    expect(formatDisplayValue(1234.567, "money")).toBe("1,234.57");
  });

  it("formats line type values in Chinese", () => {
    expect(formatDisplayValue("instance", "lineType")).toBe("实例");
    expect(formatDisplayValue("fee", "lineType")).toBe("非实例费用");
  });

  it("formats API date values for date inputs without UTC day drift", () => {
    expect(formatDateInputValue("2026-10-01")).toBe("2026-10-01");
    expect(formatDateInputValue("2026-09-30T16:00:00.000Z")).toBe("2026-10-01");
    expect(formatDateInputValue("2026-10-01 00:00:00")).toBe("2026-10-01");
    expect(formatDateInputValue(null)).toBe("");
  });
});
