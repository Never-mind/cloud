import { describe, expect, it } from "vitest";
import { isRequestType, requireRequestType } from "./request-type";

describe("request type", () => {
  it("only accepts whole-machine and spare-parts values", () => {
    expect(isRequestType("整机")).toBe(true);
    expect(isRequestType("备件")).toBe(true);
    expect(isRequestType("其他")).toBe(false);
  });

  it("rejects blank and unsupported values", () => {
    expect(() => requireRequestType("")).toThrow("类型不能为空");
    expect(() => requireRequestType("其他")).toThrow("类型只能选择整机或备件");
  });
});
