import { describe, expect, it } from "vitest";
import { importRowsWithReport } from "./entity-import";
import type { EntityConfig } from "./modules";

const config = {
  key: "countries",
  title: "国家",
  table: "countries",
  primaryKey: "code",
  navGroup: "基础信息",
  route: "/master-data/countries",
  description: "",
  listFields: [],
  formFields: [],
  filters: [],
} satisfies EntityConfig;

describe("entity import", () => {
  it("reports total, successful rows, and failed row details", async () => {
    const result = await importRowsWithReport(
      config,
      [{ code: "CN" }, { code: "BAD" }, { code: "MX" }],
      async (row) => {
        if (row.code === "BAD") throw new Error("代码重复");
      },
    );

    expect(result.total).toBe(3);
    expect(result.success).toBe(2);
    expect(result.failed).toEqual([{ rowNumber: 3, primaryKey: "BAD", error: "代码重复" }]);
  });
});
