import { randomUUID } from "node:crypto";

/**
 * 明细行的主键生成。
 *
 * 以前这些 id 是按"明细在数组里的第几条"拼出来的（例如 `BAI-调整单号-003`）。
 * 只要用户删掉中间一条、再在末尾新增一条，新行就会拿到已经被占用的序号，
 * 保存时直接撞主键：`Duplicate entry ... for key ...`。
 *
 * 明细的 id 只用于标识这一行，不需要可读、也不需要可复现，所以改成随机后缀。
 */
export function createLineId(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/**
 * 提交前自检：同一批明细里出现重复 id 时给出可读提示，
 * 而不是把 MySQL 的 `Duplicate entry ... for key ...` 直接抛给用户。
 */
export function assertUniqueLineIds(rows: Array<{ id?: string | null }>, label: string) {
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const id = String(row.id ?? "").trim();
    if (!id) return;
    const firstIndex = seen.get(id);
    if (firstIndex !== undefined) {
      throw new Error(
        `${label}第 ${firstIndex + 1} 条与第 ${index + 1} 条的明细编号重复（${id}），请删除其中一条后重新添加`,
      );
    }
    seen.set(id, index);
  });
}
