import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryRows, execute, executeInTransaction, withTransaction } = vi.hoisted(() => ({
  queryRows: vi.fn(),
  execute: vi.fn(),
  executeInTransaction: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock("./db", () => ({
  queryRows,
  execute,
  executeInTransaction,
  withTransaction,
}));

import { appendPrepaymentWriteOffMonth, listAppendableWriteOffMonths } from "./prepayment-adjustment-service";
import { deletePrepaymentWriteOffTail } from "./prepayment-adjustment-service";

describe("追加尾期：按合同号列出可追加明细", () => {
  beforeEach(() => {
    queryRows.mockReset();
    execute.mockReset();
  });

  it("合同号为空时直接报错，不查库", async () => {
    await expect(listAppendableWriteOffMonths("  ")).rejects.toThrow("请输入预付款合同号");
    expect(queryRows).not.toHaveBeenCalled();
  });

  it("合同没有明细时提示合同不存在", async () => {
    queryRows.mockResolvedValueOnce([]);
    await expect(listAppendableWriteOffMonths("PPC-NONE")).rejects.toThrow("不存在或没有明细");
  });

  it("按已生效金额算剩余，并给出下一期期号与月份", async () => {
    queryRows
      .mockResolvedValueOnce([
        {
          id: "PPCI-001",
          deviceCode: "06113690",
          modelCode: "XV755.0.0.6",
          nameEn: "i2ZS01 Network Enhancement A1",
          contractTotalAmount: "30259.6400",
          written: "1000.0000",
          lastMonth: new Date(2026, 8, 1),
          lastIndex: 24,
        },
        {
          id: "PPCI-002",
          deviceCode: "06113691",
          modelCode: "XV755.0.0.7",
          nameEn: "i2ZS01 Network Enhancement A2",
          contractTotalAmount: "1000.0000",
          written: "1500.0000",
          lastMonth: new Date(2026, 8, 1),
          lastIndex: 24,
        },
      ])
      .mockResolvedValueOnce([
        { id: "MWO-PPCI-001-025", contractLineId: "PPCI-001", writeOffMonth: new Date(2026, 9, 1), monthIndex: 25, monthlyAmount: "6000.0000" },
      ]);

    const items = await listAppendableWriteOffMonths("PPC-20260911");

    expect(items[0]).toEqual(
      expect.objectContaining({
        contractLineId: "PPCI-001",
        lineAmount: 30259.64,
        written: 1000,
        remaining: 29259.64,
        monthIndex: 25,
        nextMonth: "2026-10-01",
        settled: false,
        tails: [{ id: "MWO-PPCI-001-025", writeOffMonth: "2026-10-01", monthIndex: 25, amount: 6000 }],
      }),
    );
    // 已核销超过明细金额的行只标 settled，不报错，交给合同核销状态提醒兜底。
    expect(items[1]).toEqual(expect.objectContaining({ remaining: -500, settled: true, tails: [] }));
  });
});

describe("追加尾期：超额只提醒不拦截", () => {
  beforeEach(() => {
    queryRows.mockReset();
    execute.mockReset();
  });

  const line = {
    id: "PPCI-001",
    contractNo: "PPC-20260911",
    contractTotalAmount: "1000.0000",
    writeOffStartMonth: new Date(2026, 8, 1),
    currency: "USD",
    contractStatus: "已确认",
  };

  it("草稿合同不允许追加尾期（确认时会重新生成 24 期，加了也会被覆盖）", async () => {
    queryRows.mockResolvedValueOnce([{ ...line, contractStatus: "草稿" }]);

    await expect(appendPrepaymentWriteOffMonth({ contractLineId: "PPCI-001" })).rejects.toThrow("请先确认预付款合同");
    expect(execute).not.toHaveBeenCalled();
  });

  it("默认金额按剩余额度补齐，期末合计等于明细金额时不提示", async () => {
    queryRows.mockResolvedValueOnce([line]).mockResolvedValueOnce([
      { written: "600.0000", lastIndex: 24, lastMonth: new Date(2026, 8, 1) },
    ]);

    const result = await appendPrepaymentWriteOffMonth({ contractLineId: "PPCI-001" });

    expect(result).toEqual(
      expect.objectContaining({ amount: 400, remainingBefore: 400, writtenTotal: 1000, warning: "", monthIndex: 25, writeOffMonth: "2026-10-01" }),
    );
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("手动填大金额时只返回 warning，不阻断保存", async () => {
    queryRows.mockResolvedValueOnce([line]).mockResolvedValueOnce([
      { written: "600.0000", lastIndex: 24, lastMonth: new Date(2026, 8, 1) },
    ]);

    const result = await appendPrepaymentWriteOffMonth({ contractLineId: "PPCI-001", amount: 900 });

    expect(result.warning).toContain("超过明细金额");
    expect(result.writtenTotal).toBe(1500);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("已核销完的明细不再允许追加", async () => {
    queryRows.mockResolvedValueOnce([line]).mockResolvedValueOnce([
      { written: "1000.0000", lastIndex: 24, lastMonth: new Date(2026, 8, 1) },
    ]);

    await expect(appendPrepaymentWriteOffMonth({ contractLineId: "PPCI-001" })).rejects.toThrow("已核销完");
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("追加尾期：误加后撤销", () => {
  const tailRow = {
    id: "MWO-PPCI-001-025",
    contractNo: "PPC-20260911",
    contractLineId: "PPCI-001",
    writeOffMonth: new Date(2026, 9, 1),
    monthIndex: 25,
    monthlyAmount: "6000.0000",
    sourceType: "追加尾期",
  };

  beforeEach(() => {
    queryRows.mockReset();
    execute.mockReset();
    executeInTransaction.mockReset().mockResolvedValue(undefined);
    withTransaction.mockReset().mockImplementation(async (callback: (connection: unknown) => Promise<unknown>) => callback({}));
  });

  it("没有传 id 直接报错，不查库", async () => {
    await expect(deletePrepaymentWriteOffTail("  ")).rejects.toThrow("请选择要删除的尾期");
    expect(queryRows).not.toHaveBeenCalled();
  });

  it("行不存在时提示已被删除", async () => {
    queryRows.mockResolvedValueOnce([]);
    await expect(deletePrepaymentWriteOffTail("MWO-NONE")).rejects.toThrow("不存在");
  });

  it("合同确认生成的前 24 期不允许删除（哪怕来源被改成调整单）", async () => {
    queryRows.mockResolvedValueOnce([{ ...tailRow, monthIndex: 24, sourceType: "调整单" }]);
    await expect(deletePrepaymentWriteOffTail(tailRow.id)).rejects.toThrow("只有追加产生的尾期");
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("来源被调整单覆盖成“首次生成”的尾期依然可以删（按第 25 期判定）", async () => {
    queryRows
      .mockResolvedValueOnce([{ ...tailRow, sourceType: "首次生成" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ lastIndex: 24 }]);

    const result = await deletePrepaymentWriteOffTail(tailRow.id);

    expect(result).toEqual(expect.objectContaining({ id: tailRow.id, monthIndex: 25, totalMonths: 24, cleanedDraftAdjustments: [] }));
    expect(executeInTransaction).toHaveBeenCalledTimes(2);
  });

  it("被已确认的调整单引用时阻断并给出单号", async () => {
    queryRows
      .mockResolvedValueOnce([tailRow])
      .mockResolvedValueOnce([{ adjustmentNo: "PWA-20260922", status: "已确认" }]);

    await expect(deletePrepaymentWriteOffTail(tailRow.id)).rejects.toThrow("PWA-20260922");
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("只被草稿调整单引用时不阻断，删除时把该期从草稿里摘掉并重算统计", async () => {
    queryRows
      .mockResolvedValueOnce([tailRow])
      .mockResolvedValueOnce([{ adjustmentNo: "PWA-DRAFT", status: "草稿" }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ lastIndex: 25 }]);

    const result = await deletePrepaymentWriteOffTail(tailRow.id);

    expect(result.cleanedDraftAdjustments).toEqual(["PWA-DRAFT"]);
    const statements = executeInTransaction.mock.calls.map((call) => String(call[1]));
    expect(statements[0]).toContain("DELETE FROM monthlyprepaymentwriteoffs");
    expect(statements[1]).toContain("DELETE FROM prepaymentwriteoffadjustmentitems");
    expect(statements[2]).toContain("target.itemCount");
    expect(statements[3]).toContain("SET totalMonths = :lastIndex");
  });

  it("被服务费对账单引用时阻断", async () => {
    queryRows
      .mockResolvedValueOnce([tailRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 1 }]);

    await expect(deletePrepaymentWriteOffTail(tailRow.id)).rejects.toThrow("服务费对账单");
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("正常删除时移除该期并把剩余各期的 totalMonths 回退", async () => {
    queryRows
      .mockResolvedValueOnce([tailRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([{ lastIndex: 24 }]);

    const result = await deletePrepaymentWriteOffTail(tailRow.id);

    expect(result).toEqual(
      expect.objectContaining({
        id: tailRow.id,
        contractNo: "PPC-20260911",
        contractLineId: "PPCI-001",
        writeOffMonth: "2026-10-01",
        monthIndex: 25,
        amount: 6000,
        totalMonths: 24,
      }),
    );
    expect(executeInTransaction).toHaveBeenCalledTimes(2);
    expect(String(executeInTransaction.mock.calls[0][1])).toContain("DELETE FROM monthlyprepaymentwriteoffs");
    expect(String(executeInTransaction.mock.calls[1][1])).toContain("SET totalMonths = :lastIndex");
  });
});
