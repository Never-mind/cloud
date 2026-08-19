import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { execute, queryRows } from "./db";
import {
  assertCanDeleteFolder,
  categorizeDocumentFile,
  getFileExtension,
  normalizeFolderName,
  sanitizeDocumentFileName,
} from "./document-utils";

export const DOCUMENT_ROOT_ID = "ROOT";
const uploadRoot = path.join(process.cwd(), "uploads", "documents");

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
  storedName: string;
  filePath: string;
  mimeType: string | null;
  extension: string | null;
  category: string;
  fileSize: number;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function ensureDefaultDocumentFolders() {
  await execute(
    `
      INSERT IGNORE INTO documentfolders (folderId, parentId, name, sortOrder)
      VALUES (:folderId, NULL, :name, 0)
    `,
    { folderId: DOCUMENT_ROOT_ID, name: "文档管理" },
  );

  for (const [index, name] of ["MX", "CL", "BR"].entries()) {
    await execute(
      `
        INSERT IGNORE INTO documentfolders (folderId, parentId, name, sortOrder)
        VALUES (:folderId, :parentId, :name, :sortOrder)
      `,
      { folderId: `ROOT-${name}`, parentId: DOCUMENT_ROOT_ID, name, sortOrder: index + 1 },
    );
  }
}

export async function getDocumentItems(folderId = DOCUMENT_ROOT_ID, options: { page?: number; pageSize?: number; keyword?: string } = {}) {
  await ensureDefaultDocumentFolders();
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM documentfolders WHERE folderId = :folderId", { folderId });
  if (!folder) {
    throw new Error("文件夹不存在");
  }

  const folders = await queryRows<DocumentFolder>(
    "SELECT * FROM documentfolders WHERE parentId = :folderId ORDER BY sortOrder ASC, name ASC",
    { folderId },
  );
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(options.pageSize ?? 20) || 20)));
  const requestedPage = Math.max(1, Math.floor(Number(options.page ?? 1) || 1));
  const keyword = String(options.keyword ?? "").trim();
  const fileWhere = keyword ? "AND originalName LIKE :keyword" : "";
  const fileParams = keyword ? { folderId, keyword: `%${keyword}%` } : { folderId };
  const [{ total: totalValue }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM documentfiles WHERE folderId = :folderId ${fileWhere}`,
    fileParams,
  );
  const total = Number(totalValue ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const files = await queryRows<DocumentFile>(
    `SELECT * FROM documentfiles WHERE folderId = :folderId ${fileWhere} ORDER BY createdAt DESC, originalName ASC LIMIT :limit OFFSET :offset`,
    { ...fileParams, limit: pageSize, offset: (page - 1) * pageSize },
  );
  const breadcrumbs = await getFolderBreadcrumbs(folderId);
  return { folder, folders, files, breadcrumbs, total, page, pageSize, totalPages };
}

export async function getDocumentTree() {
  await ensureDefaultDocumentFolders();
  return queryRows<DocumentFolder>("SELECT * FROM documentfolders ORDER BY parentId ASC, sortOrder ASC, name ASC");
}

export async function createDocumentFolder(parentId: string, rawName: string) {
  await ensureDefaultDocumentFolders();
  const name = normalizeFolderName(rawName);
  await assertFolderExists(parentId);
  await assertUniqueFolderName(parentId, name);

  const folderId = `FOLDER-${randomUUID()}`;
  await execute(
    `
      INSERT INTO documentfolders (folderId, parentId, name)
      VALUES (:folderId, :parentId, :name)
    `,
    { folderId, parentId, name },
  );
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM documentfolders WHERE folderId = :folderId", { folderId });
  return folder;
}

export async function renameDocumentFolder(folderId: string, rawName: string) {
  if (folderId === DOCUMENT_ROOT_ID) {
    throw new Error("根目录不能重命名");
  }
  const name = normalizeFolderName(rawName);
  const [folder] = await queryRows<DocumentFolder>("SELECT * FROM documentfolders WHERE folderId = :folderId", { folderId });
  if (!folder) throw new Error("文件夹不存在");
  await assertUniqueFolderName(folder.parentId, name, folderId);
  await execute("UPDATE documentfolders SET name = :name WHERE folderId = :folderId", { folderId, name });
  return { ...folder, name };
}

export async function deleteDocumentFolder(folderId: string) {
  if (folderId === DOCUMENT_ROOT_ID || folderId.startsWith("ROOT-")) {
    throw new Error("默认国家文件夹不能删除");
  }
  const [counts] = await queryRows<{ folderCount: number; fileCount: number }>(
    `
      SELECT
        (SELECT COUNT(*) FROM documentfolders WHERE parentId = :folderId) AS folderCount,
        (SELECT COUNT(*) FROM documentfiles WHERE folderId = :folderId) AS fileCount
    `,
    { folderId },
  );
  assertCanDeleteFolder({
    folderCount: Number(counts?.folderCount ?? 0),
    fileCount: Number(counts?.fileCount ?? 0),
  });
  await execute("DELETE FROM documentfolders WHERE folderId = :folderId", { folderId });
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
  await mkdir(uploadRoot, { recursive: true });

  const fileId = `FILE-${randomUUID()}`;
  const safeName = sanitizeDocumentFileName(originalName);
  const storedName = `${fileId}-${safeName}`;
  const filePath = path.join(uploadRoot, storedName);
  const extension = getFileExtension(originalName);
  const category = categorizeDocumentFile(originalName, mimeType);

  await writeFile(filePath, bytes);
  await execute(
    `
      INSERT INTO documentfiles
        (fileId, folderId, originalName, storedName, filePath, mimeType, extension, category, fileSize, uploadedBy)
      VALUES
        (:fileId, :folderId, :originalName, :storedName, :filePath, :mimeType, :extension, :category, :fileSize, :uploadedBy)
    `,
    {
      fileId,
      folderId,
      originalName: safeName,
      storedName,
      filePath,
      mimeType,
      extension,
      category,
      fileSize: bytes.length,
      uploadedBy,
    },
  );
  const [file] = await queryRows<DocumentFile>("SELECT * FROM documentfiles WHERE fileId = :fileId", { fileId });
  return file;
}

export async function renameDocumentFile(fileId: string, rawName: string) {
  const originalName = sanitizeDocumentFileName(rawName);
  await execute(
    "UPDATE documentfiles SET originalName = :originalName, extension = :extension, category = :category WHERE fileId = :fileId",
    {
      fileId,
      originalName,
      extension: getFileExtension(originalName),
      category: categorizeDocumentFile(originalName, ""),
    },
  );
  const [file] = await queryRows<DocumentFile>("SELECT * FROM documentfiles WHERE fileId = :fileId", { fileId });
  return file;
}

export async function deleteDocumentFile(fileId: string) {
  const [file] = await queryRows<DocumentFile>("SELECT * FROM documentfiles WHERE fileId = :fileId", { fileId });
  if (!file) return;
  await execute("DELETE FROM documentfiles WHERE fileId = :fileId", { fileId });
  await unlink(file.filePath).catch(() => undefined);
}

export async function getDocumentFileForDownload(fileId: string) {
  const [file] = await queryRows<DocumentFile>("SELECT * FROM documentfiles WHERE fileId = :fileId", { fileId });
  if (!file) throw new Error("文件不存在");
  const bytes = await readFile(file.filePath);
  return { file, bytes };
}

async function assertFolderExists(folderId: string) {
  const rows = await queryRows<{ count: number }>("SELECT COUNT(*) AS count FROM documentfolders WHERE folderId = :folderId", {
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
      FROM documentfolders
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
  const folders = await queryRows<DocumentFolder>("SELECT * FROM documentfolders");
  const byId = new Map(folders.map((folder) => [folder.folderId, folder]));
  const result: Array<Pick<DocumentFolder, "folderId" | "name">> = [];
  let cursor = byId.get(folderId);
  while (cursor) {
    result.unshift({ folderId: cursor.folderId, name: cursor.name });
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return result;
}
