import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EQUIPMENT_ONLY_INSTANCE_CONDITION } from "./instance-model-type";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("finance instance type filter", () => {
  it("keeps unmaintained instance models on the previous (equipment) behaviour", () => {
    expect(EQUIPMENT_ONLY_INSTANCE_CONDITION).toBe("COALESCE(NULLIF(im.instanceType, ''), 'Equipment') = 'Equipment'");
  });

  it("applies the equipment-only filter to every available-instance query", () => {
    // 每个文件期望：1 次 import + 查询处使用次数（列表查询 + 筛选候选项查询）
    const expectations: Array<[string, number]> = [
      ["src/lib/billing-service.ts", 2],
      ["src/lib/prepayment-service.ts", 2],
      ["src/lib/balance-settlement-service.ts", 2],
    ];
    for (const [file, usages] of expectations) {
      const occurrences = read(file).split("EQUIPMENT_ONLY_INSTANCE_CONDITION").length - 1;
      expect(occurrences, `${file} 应在 ${usages} 处查询中使用设备类型过滤`).toBe(usages + 1);
    }
  });
});
