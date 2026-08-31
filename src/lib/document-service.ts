import { randomUUID } from "crypto";
import { execute, queryRows } from "./db";
import {
  assertCanDeleteFolder,
  categorizeDocumentFile,
  getFileExtension,
  normalizeFolderName,
  sanitizeDocumentFileName,
} from "./document-utils";

export const DOCUMENT_ROOT_ID = "ROOT";

export type DocumentFolder = {
  folderId: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentFile = {
  fileId: string;
  folderId: string;
  originalName: string;
  mimeType: string | null;
  extension: string | null;
  category: string;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredDocumentFile = {
  fileId: string;
  folderId: string;
  fileName: string;
  fileType: string | null;
  fileSize: number;
  dataUrl: string;
  uploadedByUserId: string | null;
  uploadedAt: string;
  updatedAt: string;
};

export async function ensureDefaultDocumentFolders() {
  await execute(
    `
      INSERT IGNORE INTO merge_common_document_folders (folderId, parentId, name, sortOrder)
      VALUES (:folderId, NULL, :name, 0)
    `,
    { folderId: DOCUMENT_ROOT_ID, name: "文档管理" },
  );

  for (const [index, name] of ["MX", "CL", "BR"].entries()) {
    await execute(
      `
        INSERT IGNORE INTO merge_common_document_folders (folderId, parentId, name, sortOrder)
        VALUES (:folderId, :parentId, :name, :sortOrder)
      `,
      { folderId: `ROOT-${name}`, parentId: DOCUMENT_ROOT_ID, name, sortOrder: index + 1 },
    );
  }
}

export async function getDocumentItems(folderId = DOCUMENT_ROOT_ID, options: { page?: number; pageSize?: number; keyword?: string } = {}) {
  await ensureDefaultDocumentFolders();
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM merge_common_document_folders WHERE folderId = :folderId", { folderId });
  if (!folder) {
    throw new Error("文件夹不存在");
  }

  const folders = await queryRows<DocumentFolder>(
    "SELECT * FROM merge_common_document_folders WHERE parentId = :folderId ORDER BY sortOrder ASC, name ASC",
    { folderId },
  );
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(options.pageSize ?? 20) || 20)));
  const requestedPage = Math.max(1, Math.floor(Number(options.page ?? 1) || 1));
  const keyword = String(options.keyword ?? "").trim();
  const fileWhere = keyword ? "AND fileName LIKE :keyword" : "";
  const fileParams = keyword ? { folderId, keyword: `%${keyword}%` } : { folderId };
  const [{ total: totalValue }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM merge_common_document_files WHERE folderId = :folderId ${fileWhere}`,
    fileParams,
  );
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const storedFiles = await queryRows<StoredDocumentFile>(
    `SELECT fileId, folderId, fileName, fileType, fileSize, uploadedByUserId, uploadedAt, updatedAt
     FROM merge_common_document_files
     WHERE folderId = :folderId ${fileWhere}
     ORDER BY uploadedAt DESC, fileName ASC
     LIMIT :limit OFFSET :offset`,
    { ...fileParams, limit: pageSize, offset: (page - 1) * pageSize },
  );
  const files = storedFiles.map(toDocumentFile);
  const breadcrumbs = await getFolderBreadcrumbs(folderId);
  return { folder, folders, files, breadcrumbs, total, page, pageSize, totalPages };
}

export async function getDocumentTree() {
  await ensureDefaultDocumentFolders();
  return queryRows<DocumentFolder>("SELECT * FROM merge_common_document_folders ORDER BY parentId ASC, sortOrder ASC, name ASC");
}

export async function createDocumentFolder(parentId: string, rawName: string) {
  await ensureDefaultDocumentFolders();
  const name = normalizeFolderName(rawName);
  await assertFolderExists(parentId);
  await assertUniqueFolderName(parentId, name);

  const folderId = `FOLDER-${randomUUID()}`;
  await execute(
    `
      INSERT INTO merge_common_document_folders (folderId, parentId, name)
      VALUES (:folderId, :parentId, :name)
    `,
    { folderId, parentId, name },
  );
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM merge_common_document_folders WHERE folderId = :folderId", { folderId });
  return folder;
}

export async function renameDocumentFolder(folderId: string, rawName: string) {
  if (folderId === DOCUMENT_ROOT_ID) {
    throw new Error("根目录不能重命名");
  }
  const name = normalizeFolderName(rawName);
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM merge_common_document_folders WHERE folderId = :folderId", { folderId });
  if (!folder) throw new Error("文件夹不存在");
  await assertUniqueFolderName(folder.parentId, name, folderId);
  await execute("UPDATE merge_common_document_folders SET name = :name WHERE folderId = :folderId", { folderId, name });
  return { ...folder, name };
}

export async function deleteDocumentFolder(folderId: string) {
  if (folderId === DOCUMENT_ROOT_ID || folderId.startsWith("ROOT-")) {
    throw new Error("默认国家文件夹不能删除");
  }
  const [counts] = await queryRows<{ folderCount: number; fileCount: number }>(
    `
      SELECT
        (SELECT COUNT(*) FROM merge_common_document_folders WHERE parentId = :folderId) AS folderCount,
        (SELECT COUNT(*) FROM merge_common_document_files WHERE folderId = :folderId) AS fileCount
    `,
    { folderId },
  );
  assertCanDeleteFolder({
    folderCount: Number(counts?.folderCount ?? 0),
    fileCount: Number(counts?.fileCount ?? 0),
  });
  await execute("DELETE FROM merge_common_document_folders WHERE folderId = :folderId", { folderId });
}

export async function saveUploadedDocumentFile({
  folderId,
  originalName,
  mimeType,
  bytes,
  uploadedBy = "admin",
}: {
  folderId: string;
  originalName: string;
  mimeType: string;
  bytes: Buffer;
  uploadedBy?: string;
}) {
  await assertFolderExists(folderId);

  const fileId = `FILE-${randomUUID()}`;
  const safeName = sanitizeDocumentFileName(originalName);
  const contentType = mimeType || "application/octet-stream";
  const dataUrl = `data:${contentType};base64,${bytes.toString("base64")}`;
  await execute(
    `
      INSERT INTO merge_common_document_files
        (fileId, folderId, fileName, fileType, fileSize, dataUrl, uploadedByUserId)
      VALUES
        (:fileId, :folderId, :fileName, :fileType, :fileSize, :dataUrl, :uploadedByUserId)
    `,
    {
      fileId,
      folderId,
      fileName: safeName,
      fileType: contentType,
      fileSize: bytes.length,
      dataUrl,
      uploadedByUserId: uploadedBy,
    },
  );
  const [file] = await queryRows<StoredDocumentFile>(
    "SELECT fileId, folderId, fileName, fileType, fileSize, uploadedByUserId, uploadedAt, updatedAt FROM merge_common_document_files WHERE fileId = :fileId",
    { fileId },
  );
  return file ? toDocumentFile(file) : undefined;
}

export async function renameDocumentFile(fileId: string, rawName: string) {
  const originalName = sanitizeDocumentFileName(rawName);
  const [file] = await queryRows<Pick<StoredDocumentFile, "fileType">>(
    "SELECT fileType FROM merge_common_document_files WHERE fileId = :fileId",
    { fileId },
  );
  if (!file) throw new Error("文件不存在");
  await execute(
    "UPDATE merge_common_document_files SET fileName = :fileName WHERE fileId = :fileId",
    {
      fileId,
      fileName: originalName,
    },
  );
  const [renamed] = await queryRows<StoredDocumentFile>(
    "SELECT fileId, folderId, fileName, fileType, fileSize, uploadedByUserId, uploadedAt, updatedAt FROM merge_common_document_files WHERE fileId = :fileId",
    { fileId },
  );
  return renamed ? toDocumentFile(renamed) : undefined;
}

export async function deleteDocumentFile(fileId: string) {
  const [file] = await queryRows<{ fileId: string }>("SELECT fileId FROM merge_common_document_files WHERE fileId = :fileId", { fileId });
  if (!file) return;
  await execute("DELETE FROM merge_common_document_files WHERE fileId = :fileId", { fileId });
}

export async function getDocumentFileForDownload(fileId: string) {
  const [storedFile] = await queryRows<StoredDocumentFile>(
    "SELECT fileId, folderId, fileName, fileType, fileSize, dataUrl, uploadedByUserId, uploadedAt, updatedAt FROM merge_common_document_files WHERE fileId = :fileId",
    { fileId },
  );
  const file = storedFile ? toDocumentFile(storedFile) : undefined;
  if (!file) throw new Error("文件不存在");
  const match = String(storedFile?.dataUrl ?? "").match(/^data:[^;,]+;base64,([\s\S]*)$/);
  if (!match) throw new Error("文件内容不存在");
  const bytes = Buffer.from(match[1], "base64");
  return { file, bytes };
}

async function assertFolderExists(folderId: string) {
  const rows = await queryRows<{ count: number }>("SELECT COUNT(*) AS count FROM merge_common_document_folders WHERE folderId = :folderId", {
    folderId,
  });
  if (Number(rows[0]?.count ?? 0) === 0) {
    throw new Error("文件夹不存在");
  }
}

async function assertUniqueFolderName(parentId: string | null, name: string, exceptFolderId?: string) {
  const rows = await queryRows<{ count: number }>(
    `
      SELECT COUNT(*) AS count
      FROM merge_common_document_folders
      WHERE ${parentId === null ? "parentId IS NULL" : "parentId = :parentId"}
        AND name = :name
        ${exceptFolderId ? "AND folderId <> :exceptFolderId" : ""}
    `,
    { parentId, name, exceptFolderId },
  );
  if (Number(rows[0]?.count ?? 0) > 0) {
    throw new Error("同一目录下已存在同名文件夹");
  }
}

async function getFolderBreadcrumbs(folderId: string) {
  const folders = await queryRows<DocumentFolder>("SELECT * FROM merge_common_document_folders");
  const byId = new Map(folders.map((folder) => [folder.folderId, folder]));
  const result: Array<Pick<DocumentFolder, "folderId" | "name">> = [];
  let cursor = byId.get(folderId);
  while (cursor) {
    result.unshift({ folderId: cursor.folderId, name: cursor.name });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return result;
}

function toDocumentFile(file: StoredDocumentFile): DocumentFile {
  return {
    fileId: file.fileId,
    folderId: file.folderId,
    originalName: file.fileName,
    mimeType: file.fileType,
    extension: getFileExtension(file.fileName),
    category: categorizeDocumentFile(file.fileName, file.fileType ?? ""),
    fileSize: Number(file.fileSize ?? 0),
    uploadedBy: file.uploadedByUserId,
    createdAt: file.uploadedAt,
    updatedAt: file.updatedAt,
  };
}
