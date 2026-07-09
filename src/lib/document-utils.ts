export type DocumentFileCategory = "pdf" | "word" | "spreadsheet" | "image" | "archive" | "other";

const unsafeFileNameChars = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeDocumentFileName(name: string) {
  const trimmed = name.trim().replace(/^(\.\.[/\\])+/, "").replace(/^[.\s\\\/]+/, "");
  const cleaned = trimmed.replace(unsafeFileNameChars, "_").replace(/\s+/g, " ").trim();
  return cleaned || "unnamed";
}

export function normalizeFolderName(name: string) {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value) {
    throw new Error("文件夹名称不能为空");
  }
  if (value.includes("/") || value.includes("\\") || value === "." || value === ".." || value.includes("..")) {
    throw new Error("文件夹名称不能包含路径符号");
  }
  return value;
}

export function getFileExtension(name: string) {
  const sanitized = sanitizeDocumentFileName(name);
  const dotIndex = sanitized.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === sanitized.length - 1) return "";
  return sanitized.slice(dotIndex + 1).toLowerCase();
}

export function categorizeDocumentFile(name: string, mimeType: string): DocumentFileCategory {
  const extension = getFileExtension(name);
  if (extension === "pdf" || mimeType === "application/pdf") return "pdf";
  if (["doc", "docx"].includes(extension)) return "word";
  if (["xls", "xlsx", "csv"].includes(extension)) return "spreadsheet";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extension) || mimeType.startsWith("image/")) return "image";
  if (["zip", "rar", "7z"].includes(extension)) return "archive";
  return "other";
}

export function assertCanDeleteFolder({ folderCount, fileCount }: { folderCount: number; fileCount: number }) {
  if (folderCount > 0 || fileCount > 0) {
    throw new Error("请先删除文件夹内的子文件夹和文件");
  }
}
