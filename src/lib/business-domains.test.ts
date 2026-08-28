import { describe, expect, it } from "vitest";
import { BUSINESS_DOMAINS, getBusinessDomain } from "./business-domains";

describe("business domain navigation", () => {
  it("defines the three top-level business systems", () => {
    expect(BUSINESS_DOMAINS.map((domain) => domain.title)).toEqual([
      "算力系统",
      "集采系统",
      "华为云业务",
    ]);
  });

  it("falls back to the power delivery domain", () => {
    expect(getBusinessDomain("unknown").key).toBe("power");
  });
});
