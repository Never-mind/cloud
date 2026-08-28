import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRows, execute } = vi.hoisted(() => ({
  queryRows: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("./db", () => ({
  queryRows,
  execute,
}));

import { findProductByCode, matchCustomerPoItems } from "./po-product-service";

describe("集采产品主档匹配", () => {
  beforeEach(() => {
    queryRows.mockReset();
    execute.mockReset();
  });

  it("空产品编码不会查询数据库", async () => {
    await expect(findProductByCode("  ")).resolves.toBeNull();
    expect(queryRows).not.toHaveBeenCalled();
  });

  it("客户PO明细按编码命中后回写三级产品ID", async () => {
    queryRows
      .mockResolvedValueOnce([
        { id: "item-1", matchedProductCode: " P-001 " },
        { id: "item-2", matchedProductCode: "" },
      ])
      .mockResolvedValueOnce([
        {
          productCode: "P-001",
          productMasterId: "master-1",
          productModelId: "model-1",
          productSpecId: "spec-1",
        },
      ]);

    await expect(matchCustomerPoItems("po-1")).resolves.toEqual({
      total: 2,
      matched: 1,
      unmatched: 1,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("matchStatus = 'matched'"),
      expect.objectContaining({
        id: "item-1",
        poId: "po-1",
        productMasterId: "master-1",
        productModelId: "model-1",
        productSpecId: "spec-1",
      }),
    );
  });

  it("找不到产品编码时清空旧关联并标记未匹配", async () => {
    queryRows
      .mockResolvedValueOnce([{ id: "item-1", matchedProductCode: "P-404" }])
      .mockResolvedValueOnce([]);

    await expect(matchCustomerPoItems("po-1")).resolves.toEqual({
      total: 1,
      matched: 0,
      unmatched: 1,
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("matchStatus = 'unmatched'"),
      { id: "item-1", poId: "po-1" },
    );
  });
});
