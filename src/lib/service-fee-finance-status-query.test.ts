import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({
  queryRows: db.query, queryRowsRaw: db.query, hasTableColumn: vi.fn(async () => false), INTERNAL_ID_COLUMN: "internalId",
  execute: vi.fn(), executeRaw: vi.fn(), executeInTransaction: vi.fn(), queryRowsInTransaction: vi.fn(), withTransaction: vi.fn(),
}));
vi.mock("./service-fee-invoice-ledger", () => ({ serviceFeeInvoiceEntries: vi.fn(async () => []) }));
import { listServiceFeeStatements, listServiceFeeStatementFilterOptions } from "./service-fee-service";
import { listEntityRows, listEntityFilterOptions } from "./crud";
import { getEntityConfig } from "./modules";

beforeEach(() => {
  db.query.mockReset();
  db.query.mockImplementation(async (sql: string) => sql.includes("COUNT(*) AS total") ? [{ total: 0 }] : []);
});

describe("服务费状态列表、筛选与导出查询", () => {
  it.each(["invoiceStatus", "repaymentStatus"] as const)("%s的列表计数、分页及排序使用保存状态", async field => {
    const label = field === "invoiceStatus" ? "无需开票" : "无需回款";
    await listServiceFeeStatements(new URLSearchParams({ [field]: label, [`filter.${field}`]: label, sortField: field, sortOrder: "asc" }));
    const expression = field;
    const count = db.query.mock.calls.find(([sql]) => sql.includes("COUNT(*) AS total"))!;
    const list = db.query.mock.calls.find(([sql]) => sql.includes("invoiceOriginalName,"))!;
    for (const [sql, params] of [count, list]) {
      expect(sql).toContain(`${expression} = :${field}`);
      expect(sql).toContain(`${expression} IN (`);
      expect(params[field]).toBe(label);
    }
    expect(list[0]).not.toContain("ABS(serviceFeeTotal)");
    expect(list[0]).toContain(`ORDER BY ${expression} ASC`);
    expect(list[0]).not.toContain("recordedInvoiceStatus");
    expect(list[0]).not.toContain("recordedRepaymentStatus");
  });

  it("Excel使用的通用列表也按同一状态筛选并输出", async () => {
    const config = getEntityConfig("service-fee-snapshots")!;
    await listEntityRows(config, new URLSearchParams({ invoiceStatus: "无需开票", "filter.repaymentStatus": "无需回款", sortField: "invoiceStatus", sortOrder: "asc" }));
    const count = db.query.mock.calls.find(([sql]) => sql.includes("COUNT(*) AS total"))!;
    const list = db.query.mock.calls.find(([sql]) => sql.includes(" AS `invoiceStatus`"))!;
    for (const [sql] of [count, list]) {
      expect(sql).toContain(`${"`invoiceStatus`"} = :invoiceStatus`);
      expect(sql).toContain(`${"`servicefeesnapshots`.`repaymentStatus`"} IN (`);
    }
    expect(list[0]).toContain(`${"`invoiceStatus`"} AS \`invoiceStatus\``);
  });

  it("专用表头候选值的分组和关联筛选都使用保存状态", async () => {
    await listServiceFeeStatementFilterOptions(new URLSearchParams({ field: "invoiceStatus", "filter.repaymentStatus": "无需回款" }));
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain(`GROUP BY invoiceStatus`);
    expect(sql).toContain(`repaymentStatus IN (`);
  });

  it("通用表头候选值不会把无需回款误当作未回款", async () => {
    await listEntityFilterOptions(getEntityConfig("service-fee-snapshots")!, new URLSearchParams({ field: "invoiceStatus", repaymentStatus: "无需回款" }));
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain(`${"`servicefeesnapshots`.`invoiceStatus`"} AS value`);
    expect(sql).toContain(`${"`repaymentStatus`"} = :option_repaymentStatus`);
  });
});
