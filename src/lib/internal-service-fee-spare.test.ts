import { describe, expect, it } from "vitest";
import {
  blankInternalServiceSpare,
  buildInternalServiceSpareSchedule,
  importInternalServiceSpareRows,
  normalizeInternalServiceSpare,
} from "./internal-service-fee-spare";

function validInput() {
  return {
    ...blankInternalServiceSpare(),
    countryCode: "BR",
    batchName: "BR-备件60",
    spareName: "电源模块",
    spareCode: "SP-001",
    quantity: "2",
    startMonth: "2026-11",
    procurementCostUsd: "12,345.67",
    contractExcludingTaxUsd: "20,000",
    managementFeeTotalUsd: "14,400",
    first24MonthlyUsd: "300",
    next36MonthlyUsd: "200",
    notes: "新设备维护备件",
  };
}

describe("internal service fee spare", () => {
  it("normalizes the form and builds 24 + 36 monthly rows", () => {
    const normalized = normalizeInternalServiceSpare(validInput());
    expect(normalized.errors).toEqual([]);
    expect(normalized.value).toMatchObject({
      countryCode: "BR",
      quantity: 2,
      startMonth: "2026-11-01",
      procurementCostUsd: 12345.67,
      first24MonthlyUsd: 300,
      next36MonthlyUsd: 200,
    });

    const schedule = buildInternalServiceSpareSchedule(normalized.value!);
    expect(schedule).toHaveLength(60);
    expect(schedule.slice(0, 24).every((row) => row.amount === 300)).toBe(true);
    expect(schedule.slice(24).every((row) => row.amount === 200)).toBe(true);
    expect(schedule.reduce((total, row) => total + row.amount, 0)).toBe(14400);
    expect(schedule.at(-1)?.writeOffMonth).toBe("2031-10-01");
  });

  it("rejects a total that does not equal the two stage allocations", () => {
    const result = normalizeInternalServiceSpare({ ...validInput(), managementFeeTotalUsd: "12001" });
    expect(result.value).toBeNull();
    expect(result.errors.join("\n")).toContain("管理费总额与分期金额不一致");
  });

  it("preserves archived rows and balances open months to the edited total", () => {
    const normalized = normalizeInternalServiceSpare(validInput()).value!;
    const schedule = buildInternalServiceSpareSchedule(normalized, [
      { monthIndex: 1, writeOffMonth: "2026-11-01", amount: 250 },
      { monthIndex: 2, writeOffMonth: "2026-12-01", amount: 250 },
    ]);
    expect(schedule[0]).toMatchObject({ amount: 250, archived: true });
    expect(schedule[1]).toMatchObject({ amount: 250, archived: true });
    expect(schedule.reduce((total, row) => total + row.amount, 0)).toBe(14400);
    expect(schedule.at(-1)?.amount).toBe(300);
  });

  it("imports Chinese headers and reports duplicate rows", () => {
    const result = importInternalServiceSpareRows([
      {
        国家: "br",
        批次: "BR-备件60",
        备件名称: "电源模块",
        "备件编码（可选）": "SP-001",
        数量: "2",
        开始月份: "2026/11",
        "采购成本 USD": "12,345.67",
        "合同不含税金额 USD（可选）": "20,000",
        "管理费总额 USD": "14,400",
        "前24个月月管理费 USD": "300",
        "后36个月月管理费 USD": "200",
        备注: "",
      },
      {
        国家: "BR",
        批次: "BR-备件60",
        备件名称: "电源模块",
        "备件编码（可选）": "SP-001",
        数量: "2",
        开始月份: "2026-11",
        "采购成本 USD": "12,345.67",
        "管理费总额 USD": "14,400",
        "前24个月月管理费 USD": "300",
        "后36个月月管理费 USD": "200",
      },
    ]);
    expect(result.lines).toHaveLength(1);
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowNumber: 3, error: expect.stringContaining("重复备件") }),
    ]));
  });
});
