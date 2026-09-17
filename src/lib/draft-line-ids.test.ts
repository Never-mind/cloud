import { describe, expect, it } from "vitest";
import { assertUniqueLineIds, createLineId } from "./draft-line-ids";

describe("draft line ids", () => {
  it("生成带前缀的随机 id，多次调用不重复", () => {
    const ids = Array.from({ length: 200 }, () => createLineId("BAI-TZ-001"));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("BAI-TZ-001-")).toBe(true);
  });

  it("不再依赖数组下标，删掉中间一条后新增的行不会撞已有编号", () => {
    // 老实现按 `${prefix}-${index + 1}` 生成，删中间一条 + 末尾新增必然重复
    const kept = [{ id: createLineId("BAI-X") }, { id: createLineId("BAI-X") }];
    const appended = { id: createLineId("BAI-X") };
    expect(() => assertUniqueLineIds([...kept, appended], "调整单明细")).not.toThrow();
  });

  it("同一批明细里 id 重复时给出可读提示", () => {
    expect(() => assertUniqueLineIds([{ id: "BAI-DUP" }, { id: "BAI-OK" }, { id: "BAI-DUP" }], "调整单明细"))
      .toThrowError("调整单明细第 1 条与第 3 条的明细编号重复（BAI-DUP），请删除其中一条后重新添加");
  });

  it("忽略空 id", () => {
    expect(() => assertUniqueLineIds([{ id: "" }, { id: null }, {}], "调整单明细")).not.toThrow();
  });
});
