import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRows, execute } = vi.hoisted(() => ({
  queryRows: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("./db", () => ({
  queryRows,
  execute,
}));

vi.mock("./settlement-project-service", () => ({
  ensureSettlementProjectForQuotation: vi.fn().mockResolvedValue({}),
}));

import { confirmQuotation, createQuotationFromCustomerPo, recalculateQuotationSummary } from "./quotation-workflow";

describe("报价工作流", () => {
  beforeEach(() => {
    queryRows.mockReset();
    execute.mockReset();
  });

  it("已有报价单时直接复用，不重复生成", async () => {
    queryRows
      .mockResolvedValueOnce([
        { id: "po-1", poNo: "PO-1", customerId: "cust-1", currency: "USD" },
      ])
      .mockResolvedValueOnce([
      {
        id: "quo-1",
        quotationNo: "QUO-PO-1",
        customerId: "cust-1",
        contractingUnitId: null,
        sourcePoId: "po-1",
        sourcePoNo: "PO-1",
        currency: "USD",
        totalAmount: 10,
        totalProfit: 0,
        grossMarginRate: 0,
        status: "draft",
      },
    ]);

    await expect(createQuotationFromCustomerPo("po-1")).resolves.toEqual(
      expect.objectContaining({
        quotationId: "quo-1",
        quotationNo: "QUO-PO-1",
        existing: true,
      }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("生成报价单时优先使用历史成交价并写入报价明细", async () => {
    queryRows
      .mockResolvedValueOnce([
        { id: "po-1", poNo: "PO-1", customerId: "cust-1", currency: "USD" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "item-1",
          poId: "po-1",
          lineNo: 1,
          customerProductName: "服务器A",
          customerSpec: "64G",
          quantity: 2,
          targetUnitPrice: 12,
          currency: "USD",
          matchedProductCode: "P-001",
          productMasterId: "master-1",
          productModelId: "model-1",
          productSpecId: "spec-1",
          matchStatus: "matched",
        },
      ])
      .mockResolvedValueOnce([
        { productCode: "P-001", customerPrice: 18, currency: "USD" },
      ])
      .mockResolvedValueOnce([
        { productSpecId: "spec-1", purchaseUnitPrice: 10 },
      ]);

    await expect(createQuotationFromCustomerPo("po-1")).resolves.toEqual(
      expect.objectContaining({
        quotationNo: "QUO-PO-1",
        itemCount: 1,
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO po_quotation_items"),
      expect.objectContaining({
        productCode: "P-001",
        unitPrice: 18,
        amount: 36,
        productSpecId: "spec-1",
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO po_quotations"),
      expect.objectContaining({
        totalAmount: 36,
        totalProfit: 16,
        grossMarginRate: 0.4444,
      }),
    );
  });

  it("确认报价单后会写入历史报价", async () => {
    queryRows
      .mockResolvedValueOnce([
        {
          id: "quo-1",
          quotationNo: "QUO-PO-1",
          customerId: "cust-1",
          contractingUnitId: null,
          sourcePoId: "po-1",
          sourcePoNo: "PO-1",
          currency: "USD",
          totalAmount: 36,
          totalProfit: 0,
          grossMarginRate: 0,
          status: "draft",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "item-1",
          quotationId: "quo-1",
          lineNo: 1,
          productCode: "P-001",
          productName: "服务器A",
          productMasterId: "master-1",
          productModelId: "model-1",
          productSpecId: "spec-1",
          quantity: 2,
          unitPrice: 18,
          amount: 36,
          currency: "USD",
          remark: "64G",
        },
      ]);

    await expect(confirmQuotation("quo-1")).resolves.toEqual(
      expect.objectContaining({
        quotationId: "quo-1",
        quotationNo: "QUO-PO-1",
        itemCount: 1,
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE po_quotations"),
      expect.objectContaining({
        id: "quo-1",
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO po_history_quotations"),
      expect.objectContaining({
        quotationId: "quo-1",
        productCode: "P-001",
        customerPrice: 18,
      }),
    );
  });

  it("明细变更后会重算报价单头金额和利润", async () => {
    queryRows
      .mockResolvedValueOnce([
        {
          id: "quo-1",
          quotationNo: "QUO-PO-1",
          totalAmount: 100,
          totalProfit: 20,
        },
      ])
      .mockResolvedValueOnce([
        {
          totalAmount: 60,
          totalProfit: 18,
        },
      ]);

    await expect(recalculateQuotationSummary("quo-1")).resolves.toEqual(
      expect.objectContaining({
        quotationId: "quo-1",
        quotationNo: "QUO-PO-1",
        totalAmount: 60,
        totalProfit: 18,
        grossMarginRate: 0.3,
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE po_quotations"),
      expect.objectContaining({
        id: "quo-1",
        totalAmount: 60,
        totalProfit: 18,
        grossMarginRate: 0.3,
      }),
    );
  });

  it("删空报价明细后会把表头金额重置为零", async () => {
    queryRows
      .mockResolvedValueOnce([
        {
          id: "quo-1",
          quotationNo: "QUO-PO-1",
          totalAmount: 100,
          totalProfit: 20,
        },
      ])
      .mockResolvedValueOnce([
        {
          totalAmount: 0,
          totalProfit: 0,
        },
      ]);

    await expect(recalculateQuotationSummary("QUO-PO-1")).resolves.toEqual(
      expect.objectContaining({
        quotationId: "quo-1",
        quotationNo: "QUO-PO-1",
        totalAmount: 0,
        totalProfit: 0,
        grossMarginRate: 0,
      }),
    );
  });
});
