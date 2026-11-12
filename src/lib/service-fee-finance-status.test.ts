import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { serviceFeeFinanceStatuses, serviceFeeFinanceStatusWriteSql, serviceFeeSettlementNotRequired } from "./service-fee-finance-status";

describe("服务费无需开票/回款", () => {
  it.each([0, -0.03, 0.99, -0.9999, "0.0000", "0.9999", "-0.9999"])("原币含税服务费 %s 无需办理", amount => {
    expect(serviceFeeSettlementNotRequired(amount)).toBe(true);
    expect(serviceFeeFinanceStatuses({ serviceFeeTotal: amount })).toEqual({ invoiceStatus: "无需开票", repaymentStatus: "无需回款" });
  });

  it.each([1, -1, 100, -100, "1.0000", "-1.0000", null, undefined, "", "  ", "invalid", NaN, Infinity, false])("%s 不误判为无需办理", amount => {
    expect(serviceFeeSettlementNotRequired(amount)).toBe(false);
  });

  it("不修改历史记录对象，重算离开阈值后根据保存的发票/回款资料恢复状态", () => {
    const row = { serviceFeeTotal: "-0.0300", invoiceStatus: "已开票", repaymentStatus: "已回款", invoiceNo: "F_INV_CL-202504", bankSerialNo: "FBSN-CL-202504" };
    const original = { ...row };
    expect(serviceFeeFinanceStatuses(row)).toEqual({ invoiceStatus: "无需开票", repaymentStatus: "无需回款" });
    expect(row).toEqual(original);
    expect(serviceFeeFinanceStatuses({ ...row, serviceFeeTotal: "-1.0000" })).toEqual({ invoiceStatus: "已开票", repaymentStatus: "已回款" });
    expect(serviceFeeFinanceStatuses({ serviceFeeTotal: 1, invoiceStatus: "无需开票", repaymentStatus: "无需回款" })).toEqual({ invoiceStatus: "未开票", repaymentStatus: "未回款" });
    expect(serviceFeeFinanceStatuses({ serviceFeeTotal: 1, invoiceStatus: "无需开票", repaymentStatus: "无需回款", invoiceNo: "F_INV", repaymentDate: "2026-01-31", repaymentAmount: 0 })).toEqual({ invoiceStatus: "已开票", repaymentStatus: "已回款" });
  });

  it("使用账单服务费，不依据发票、回款金额或未税金额判断", () => {
    const row = { serviceFeeTotal: 1.1, serviceFeeTotalExcludingTax: 0.95, invoiceAmountIncludingTax: 0, repaymentAmount: 0 };
    expect(serviceFeeFinanceStatuses(row)).toEqual({ invoiceStatus: "未开票", repaymentStatus: "未回款" });
  });

  it("SQL写入状态后，直接按存储字段筛选；金额恢复时依据留存记录恢复状态", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE snapshots (id INTEGER, serviceFeeTotal NUMERIC, invoiceStatus TEXT, repaymentStatus TEXT, invoiceNo TEXT, invoiceOriginalName TEXT, repaymentDate TEXT, repaymentAmount NUMERIC, repaymentAmountExcludingTax NUMERIC)");
      const amounts = [0, 0.9999, -0.9999, 1, -1, 10, -10, null];
      const insert = db.prepare("INSERT INTO snapshots(id, serviceFeeTotal, invoiceStatus, repaymentStatus) VALUES (?, ?, ?, ?)");
      amounts.forEach((amount, id) => insert.run(id, amount, id % 2 ? "已开票" : "未开票", id % 2 ? "已回款" : "未回款"));
      db.exec(`UPDATE snapshots SET invoiceStatus=${serviceFeeFinanceStatusWriteSql("invoiceStatus")}, repaymentStatus=${serviceFeeFinanceStatusWriteSql("repaymentStatus")}`);
      const invoice = "s.invoiceStatus", repayment = "s.repaymentStatus";
      const rows = db.prepare(`SELECT s.* FROM snapshots s ORDER BY id`).all();
      for (const row of rows) {
        const status = serviceFeeFinanceStatuses(row);
        expect(row.invoiceStatus).toBe(status.invoiceStatus);
        expect(row.repaymentStatus).toBe(status.repaymentStatus);
      }
      expect(db.prepare(`SELECT COUNT(*) AS total FROM snapshots s WHERE ${invoice}=? AND ${repayment}=?`).get("无需开票", "无需回款")?.total).toBe(3);
      expect(db.prepare(`SELECT COUNT(*) AS total FROM snapshots s WHERE ${invoice}=?`).get("未开票")?.total).toBe(2);
      expect(db.prepare(`SELECT id FROM snapshots s WHERE ${repayment}=? ORDER BY ${invoice}, id LIMIT 2 OFFSET 1`).all("无需回款").map(r => r.id)).toEqual([1, 2]);
      db.exec("UPDATE snapshots SET serviceFeeTotal=10 WHERE id IN (0,1); UPDATE snapshots SET invoiceNo='saved-invoice', repaymentDate='2026-01-31', repaymentAmount=0 WHERE id=1");
      db.exec(`UPDATE snapshots SET invoiceStatus=${serviceFeeFinanceStatusWriteSql("invoiceStatus")}, repaymentStatus=${serviceFeeFinanceStatusWriteSql("repaymentStatus")}`);
      expect(db.prepare("SELECT invoiceStatus,repaymentStatus FROM snapshots WHERE id=0").get()).toEqual({ invoiceStatus: "未开票", repaymentStatus: "未回款" });
      expect(db.prepare("SELECT invoiceStatus,repaymentStatus FROM snapshots WHERE id=1").get()).toEqual({ invoiceStatus: "已开票", repaymentStatus: "已回款" });
      db.exec(`UPDATE snapshots SET invoiceStatus=${serviceFeeFinanceStatusWriteSql("invoiceStatus", "'已开票'")} WHERE id=2`);
      expect(db.prepare("SELECT invoiceStatus FROM snapshots WHERE id=2").get()?.invoiceStatus).toBe("无需开票");
    } finally { db.close(); }
  });
});
