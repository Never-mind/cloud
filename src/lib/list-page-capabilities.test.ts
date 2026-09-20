import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 列表页能力契约。
 *
 * 背景：系统里既有通用列表页（`entity-page.tsx`），也有一批自定义列表页。
 * 通用页新加的能力（导出、导入、批量…）**不会自动传到自定义页**，历史上
 * 已经因此漏过导出（预付款合同就是补回来的）。这个测试把"漏"变成一个红灯：
 * 新增列表页要么接入导出，要么在下面的例外清单里登记理由。
 */

const COMPONENTS_DIR = join(process.cwd(), "src", "components");

/** 列表页判定：用到分页组件，且不是明细页/表单页/演示页。 */
function isListPage(fileName: string, source: string) {
  if (!fileName.endsWith("-page.tsx")) return false;
  if (/(detail|form|price-demo)/.test(fileName)) return false;
  return source.includes("PaginationBar");
}

/**
 * 明确不提供导出的列表页：文件名 → 理由。
 * 往这里加条目等于"决定这个页面不做导出"，需要写清原因。
 */
const EXPORT_EXEMPT: Record<string, string> = {
  "billing-adjustments-page.tsx": "数据走专用接口 /api/billing/adjustments，导出需单独实现",
  "billing-available-page.tsx": "数据走专用接口 /api/billing/available，导出需单独实现",
  "prepayment-available-page.tsx": "数据走专用接口 /api/prepayments/available，导出需单独实现",
  "prepayment-writeoff-adjustments-page.tsx": "数据走专用接口 /api/prepayment-adjustments，导出需单独实现",
  "internal-service-fee-adjustments-page.tsx": "数据走专用接口 /api/internal-service-fees/adjustments/list，导出需单独实现",
  "internal-service-fee-available-page.tsx": "数据走专用接口，且实体配置没有列表字段定义，暂不导出",
  "internal-service-fee-snapshots-page.tsx": "主从双表结构，且实体配置没有列表字段定义，暂不导出",
  "document-manager-page.tsx": "文件管理页，不是数据列表",
  "frappe-demand-sync-page.tsx": "需求同步映射工具页，按需再加",
  "import-center-page.tsx": "数据导入工具页，不是数据列表",
};

function listPageFiles() {
  return readdirSync(COMPONENTS_DIR)
    .filter((name) => name.endsWith("-page.tsx"))
    .map((name) => ({ name, source: readFileSync(join(COMPONENTS_DIR, name), "utf8") }))
    .filter((file) => isListPage(file.name, file.source));
}

describe("列表页能力契约", () => {
  it("每个列表页要么有导出入口，要么在例外清单里登记过", () => {
    const missing = listPageFiles()
      .filter((file) => !file.source.includes("导出"))
      .map((file) => file.name)
      .filter((name) => !(name in EXPORT_EXEMPT));

    expect(missing, `这些列表页既没有导出入口也没登记例外：${missing.join("、")}`).toEqual([]);
  });

  it("例外清单里没有过期条目（文件已改名或已补上导出）", () => {
    const files = new Map(
      readdirSync(COMPONENTS_DIR)
        .filter((name) => name.endsWith("-page.tsx"))
        .map((name) => [name, readFileSync(join(COMPONENTS_DIR, name), "utf8")]),
    );

    const stale = Object.keys(EXPORT_EXEMPT).filter((name) => {
      const source = files.get(name);
      // 文件不存在，或已经补上导出了，说明这条例外该删掉。
      return !source || source.includes("导出");
    });

    expect(stale, `例外清单里这些条目已失效，请删掉：${stale.join("、")}`).toEqual([]);
  });

  it("例外清单每条都写了理由", () => {
    const noReason = Object.entries(EXPORT_EXEMPT)
      .filter(([, reason]) => reason.trim().length < 6)
      .map(([name]) => name);
    expect(noReason).toEqual([]);
  });
});
