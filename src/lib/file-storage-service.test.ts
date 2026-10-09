import { afterEach, describe, expect, it, vi } from "vitest";
import { obsPutObject } from "./obs-client";
import {
  buildStorageFileName,
  buildStorageKey,
  buildStoragePrefix,
  planAttachmentPersistence,
  sanitizeStorageSegment,
  storeFile,
} from "./file-storage-service";

vi.mock("./obs-client", () => ({
  obsPutObject: vi.fn(),
  obsGetObject: vi.fn(),
  obsDeleteObject: vi.fn(),
  obsListObjects: vi.fn(),
  obsObjectExists: vi.fn(),
}));

afterEach(() => {
  delete process.env.OBS_ACCESS_KEY_ID;
  delete process.env.OBS_SECRET_ACCESS_KEY;
  delete process.env.OBS_BUCKET;
  delete process.env.OBS_PREFIX;
});

describe("sanitizeStorageSegment", () => {
  it("去掉路径分隔符与非法字符，保留中文", () => {
    expect(sanitizeStorageSegment("Hengshan/Investment:2026")).toBe("Hengshan_Investment_2026");
    expect(sanitizeStorageSegment("华为墨西哥机房扩容-2026")).toBe("华为墨西哥机房扩容-2026");
    expect(sanitizeStorageSegment("  ")).toBe("未分类");
    expect(sanitizeStorageSegment("", "BR")).toBe("BR");
  });
});

describe("buildStorageFileName", () => {
  it("发票加 Inv_ 前缀并追加唯一后缀", () => {
    expect(buildStorageFileName("7637_HengShan.pdf", "8f3a1c22-1111", true)).toBe("Inv_7637_HengShan__8f3a1c.pdf");
  });

  it("已有 Inv 前缀不重复添加，非发票不加前缀", () => {
    expect(buildStorageFileName("Inv_7637.pdf", "abcdef12", true)).toBe("Inv_7637__abcdef.pdf");
    expect(buildStorageFileName("采购合同.pdf", "abcdef12", false)).toBe("采购合同__abcdef.pdf");
  });

  it("同名文件因后缀不同不会互相覆盖", () => {
    expect(buildStorageFileName("发票.pdf", "aaaaaa11", true)).not.toBe(buildStorageFileName("发票.pdf", "bbbbbb22", true));
  });
});

describe("buildStoragePrefix / buildStorageKey", () => {
  it("未配置 OBS_PREFIX 时默认用小写 cloud（桶策略按小写目录授权）", () => {
    delete process.env.OBS_PREFIX;
    expect(buildStoragePrefix({ system: "power" })).toBe("cloud/算力/未分类/未分类/");
  });

  it("算力按国家码 + 需求单号", () => {
    process.env.OBS_PREFIX = "cloud";
    expect(buildStoragePrefix({ system: "power", country: "BR", requestNo: "eSHWC260909x91a" }, "cloud"))
      .toBe("cloud/算力/BR/eSHWC260909x91a/");
  });

  it("集采按项目、华为云按客户+年月", () => {
    expect(buildStoragePrefix({ system: "po", project: "华为墨西哥机房扩容-2026" }, "cloud")).toBe("cloud/集采/华为墨西哥机房扩容-2026/");
    expect(buildStoragePrefix({ system: "cloud", customer: "Hengshan", period: "202607" }, "cloud")).toBe("cloud/华为云/Hengshan/202607/");
  });

  it("缺失维度回落到未分类，文档库按文件夹路径", () => {
    expect(buildStoragePrefix({ system: "power" }, "cloud")).toBe("cloud/算力/未分类/未分类/");
    expect(buildStoragePrefix({ system: "docs", folderPath: "制度/采购" }, "cloud")).toBe("cloud/文档库/制度/采购/");
    expect(buildStorageKey({ system: "cloud", customer: "panda pay", period: "202607" }, "发票.pdf", "1dee0edc-2222", true))
      .toBe("cloud/华为云/panda pay/202607/Inv_发票__1dee0e.pdf");
  });

  it("公共档案按「档案类型 / 档案名称」分两层，不把斜杠压成下划线", () => {
    expect(buildStoragePrefix({ system: "common", partyLabel: "客户/LESPAGO" }, "cloud"))
      .toBe("cloud/公共/客户/LESPAGO/");
  });
});

describe("planAttachmentPersistence", () => {
  const bytes = Buffer.from("hello");

  it("OBS 可用且表里有索引列时只存对象键，dataUrl 留空", () => {
    expect(planAttachmentPersistence({
      provider: "obs",
      storageKey: "cloud/公共/客户/LESPAGO/x__abc123.pdf",
      fileType: "application/pdf",
      bytes,
      canPersistStorageKey: true,
    })).toEqual({
      storageProvider: "obs",
      storageKey: "cloud/公共/客户/LESPAGO/x__abc123.pdf",
      dataUrl: null,
      fellBackToDatabase: false,
    });
  });

  it("表里缺 storageProvider/storageKey 列时回落写 base64，避免附件变成打不开的空记录", () => {
    const plan = planAttachmentPersistence({
      provider: "obs",
      storageKey: "cloud/公共/客户/LESPAGO/x__abc123.pdf",
      fileType: "application/pdf",
      bytes,
      canPersistStorageKey: false,
    });
    expect(plan.storageProvider).toBe("db");
    expect(plan.storageKey).toBeNull();
    expect(plan.dataUrl).toBe(`data:application/pdf;base64,${bytes.toString("base64")}`);
    expect(plan.fellBackToDatabase).toBe(true);
  });

  it("未启用 OBS 时按老办法把 base64 存进数据库", () => {
    const plan = planAttachmentPersistence({
      provider: "db",
      storageKey: null,
      fileType: "image/png",
      bytes,
      canPersistStorageKey: true,
    });
    expect(plan).toMatchObject({ storageProvider: "db", storageKey: null, fellBackToDatabase: false });
    expect(plan.dataUrl).toContain("data:image/png;base64,");
  });
});

describe("storeFile", () => {
  it("OBS 上传成功时返回对象键与带后缀的文件名", async () => {
    process.env.OBS_ACCESS_KEY_ID = "ak";
    process.env.OBS_SECRET_ACCESS_KEY = "sk";
    process.env.OBS_BUCKET = "bucket";
    vi.mocked(obsPutObject).mockResolvedValue({ key: "k", size: 1, contentType: "application/pdf", metadata: {} });
    const stored = await storeFile({
      context: { system: "common", partyLabel: "客户/LESPAGO" },
      attachmentId: "470cbe0e-5194",
      fileName: "DAS_CSF.pdf",
      fileType: "application/pdf",
      bytes: Buffer.from("hello"),
    });
    expect(stored).toEqual({
      provider: "obs",
      storageKey: "cloud/公共/客户/LESPAGO/DAS_CSF__470cbe.pdf",
      fileName: "DAS_CSF__470cbe.pdf",
    });
  });

  it("OBS 上传失败时不抛错，回落成存数据库（内容不会丢）", async () => {
    process.env.OBS_ACCESS_KEY_ID = "ak";
    process.env.OBS_SECRET_ACCESS_KEY = "sk";
    process.env.OBS_BUCKET = "bucket";
    vi.mocked(obsPutObject).mockRejectedValue(new Error("OBS 上传失败（403）"));
    const stored = await storeFile({
      context: { system: "common", partyLabel: "客户/LESPAGO" },
      attachmentId: "470cbe0e-5194",
      fileName: "DAS_CSF.pdf",
      fileType: "application/pdf",
      bytes: Buffer.from("hello"),
    });
    expect(stored).toEqual({ provider: "db", storageKey: null, fileName: "DAS_CSF.pdf" });
  });
});
