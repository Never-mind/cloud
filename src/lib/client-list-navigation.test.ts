import { describe, expect, it } from "vitest";
import { buildDetailRoute, getReturnTo } from "./client-list-navigation";

describe("list/detail navigation", () => {
  it.each(["/suppliers", "/customers", "/undertaking-units", "/product-catalog", "/purchase/orders"])(
    "preserves embedded mode and list filters for %s", (path) => {
      const source = `${path}?embed=1&page=2&keyword=test`;
      const detail = new URL(buildDetailRoute(`${path}/test-id`, source), "http://local");
      expect(detail.searchParams.get("embed")).toBe("1");
      expect(getReturnTo(detail.searchParams.get("returnTo"), path)).toBe(source);
    },
  );
  it("keeps ordinary direct navigation unembedded", () => {
    expect(new URL(buildDetailRoute("/customers/test", "/customers"), "http://local").searchParams.has("embed")).toBe(false);
  });
});
