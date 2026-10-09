import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 公共档案附件上传（客户 / 供应商 / 承接单位）的防回归。
 *
 * 历史 bug（2026-10-09）：接口用 INFORMATION_SCHEMA 探测"表里有哪些可选列"，
 * 但 IN 列表只写了 uploadedByUserId / uploadedByName，`availableColumns.has('storageProvider')`
 * 永远为 false —— OBS 开启后上传的档案附件既没写对象键、dataUrl 又被置空，
 * 结果是一批"打不开的空附件"（表现为飞书开票时提示「客户档案附件内容读取失败」）。
 */
const ROUTE_PATH = "src/app/api/common/attachments/[ownerType]/[ownerId]/route.ts";

describe("公共档案附件上传的存储索引", () => {
  const source = readFileSync(resolve(process.cwd(), ROUTE_PATH), "utf8");

  it("探测可选列时必须包含 storageProvider / storageKey", () => {
    const match = source.match(/COLUMN_NAME IN \(([^)]*)\)/);
    expect(match, "上传接口应通过 INFORMATION_SCHEMA 探测可选列").not.toBeNull();
    expect(match?.[1]).toContain("storageProvider");
    expect(match?.[1]).toContain("storageKey");
  });

  it("落库字段由 planAttachmentPersistence 决定，避免 dataUrl 与索引同时为空", () => {
    expect(source).toContain("planAttachmentPersistence");
    expect(source).not.toMatch(/stored\.provider === "db" \? `data:/);
  });
});
