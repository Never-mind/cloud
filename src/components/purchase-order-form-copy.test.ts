import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("purchase order form copy", () => {
  it("keeps the new purchase order page in readable Chinese", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/purchase-order-form-page.tsx"), "utf8");

    expect(source).toContain("新建采购订单");
    expect(source).toContain("采购订单明细");
    expect(source).not.toContain("鏂板缓閲囪喘");
    expect(source).not.toContain("涓诲崟淇℃伅");
  });
});
