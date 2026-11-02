import { describe, expect, it } from "vitest";
import { normalizeBankSerialNo } from "./bank-serial-no";

describe("bank reference identifiers", () => {
  it("retains leading zeroes, long digits, case and separators", () => {
    expect(normalizeBankSerialNo("  00012345678901234567890123456789/a-B  ")).toBe("00012345678901234567890123456789/a-B");
  });
  it("allows blank historical records and rejects lossy numeric input", () => {
    expect(normalizeBankSerialNo("")).toBeNull();
    expect(normalizeBankSerialNo(null)).toBeNull();
    expect(normalizeBankSerialNo(undefined)).toBeNull();
    expect(() => normalizeBankSerialNo(12345678901234567)).toThrow("文本");
    expect(() => normalizeBankSerialNo("A".repeat(256))).toThrow("255");
  });
});
