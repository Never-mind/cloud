import { describe, expect, test } from "vitest";
import {
  assertCanDeleteFolder,
  categorizeDocumentFile,
  normalizeFolderName,
  sanitizeDocumentFileName,
} from "./document-utils";

describe("document-utils", () => {
  test("sanitizes uploaded file names while keeping useful extensions", () => {
    expect(sanitizeDocumentFileName(" 合同/发票:MX?.pdf ")).toBe("合同_发票_MX_.pdf");
    expect(sanitizeDocumentFileName("..\\secret.docx")).toBe("secret.docx");
    expect(sanitizeDocumentFileName("   ")).toBe("unnamed");
  });

  test("categorizes common office, image, archive and unknown files", () => {
    expect(categorizeDocumentFile("statement.xlsx", "")).toBe("spreadsheet");
    expect(categorizeDocumentFile("contract.PDF", "application/pdf")).toBe("pdf");
    expect(categorizeDocumentFile("invoice.png", "image/png")).toBe("image");
    expect(categorizeDocumentFile("package.zip", "application/zip")).toBe("archive");
    expect(categorizeDocumentFile("readme.txt", "text/plain")).toBe("other");
  });

  test("normalizes folder names and rejects unsafe names", () => {
    expect(normalizeFolderName(" MX 合同 ")).toBe("MX 合同");
    expect(() => normalizeFolderName("")).toThrow("文件夹名称不能为空");
    expect(() => normalizeFolderName("../MX")).toThrow("文件夹名称不能包含路径符号");
  });

  test("only allows deleting empty folders", () => {
    expect(() => assertCanDeleteFolder({ folderCount: 0, fileCount: 0 })).not.toThrow();
    expect(() => assertCanDeleteFolder({ folderCount: 1, fileCount: 0 })).toThrow("请先删除文件夹内的子文件夹和文件");
    expect(() => assertCanDeleteFolder({ folderCount: 0, fileCount: 2 })).toThrow("请先删除文件夹内的子文件夹和文件");
  });
});
