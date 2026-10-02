import { randomUUID } from "node:crypto";
import { executeRaw, queryRowsRaw, type Row } from "./db";
import { deleteFileObject, readFile, storeFile } from "./file-storage-service";
import type { OperationActor } from "./operation-actor";

/**
 * 月账单对账单附件。
 *
 * 和华为云对账行一致：票面文件在开票时自动挂一份进来，也可以手工上传外部发票或其它附件；
 * OBS 启用时文件内容放 `Cloud/算力/<国家>/<对账单号>/`，数据库只留索引。
 */

const TABLE = "merge_power_billingstatement_attachments";

/** 开票服务传的是 `{ userId, name }`，操作日志的 actor 用 `displayName`，这里两种都收。 */
type InvoiceActorLike = { name?: string | null; userId?: string | null; displayName?: string | null };

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function listStatementAttachments(snapshotNo: string) {
  return queryRowsRaw<Row>(
    `SELECT id, snapshotNo, fileName, fileType, fileSize, description, uploadedByName, uploadedAt, storageProvider
       FROM ${TABLE} WHERE snapshotNo = :snapshotNo ORDER BY uploadedAt DESC, fileName`,
    { snapshotNo },
  );
}

async function statementStorageContext(snapshotNo: string) {
  const row = (await queryRowsRaw<Row>(
    "SELECT countryCode FROM merge_power_billingstatementsnapshots WHERE snapshotNo = :snapshotNo LIMIT 1",
    { snapshotNo },
  ))[0];
  if (!row) throw new Error("月账单对账单不存在");
  // 复用算力域目录规则：Cloud/算力/<国家码>/<对账单号>/
  return { system: "power" as const, country: text(row.countryCode), requestNo: snapshotNo };
}

export async function addStatementAttachment(
  snapshotNo: string,
  input: { fileName?: unknown; fileType?: unknown; fileSize?: unknown; dataUrl?: unknown; description?: unknown },
  actor: OperationActor | null,
) {
  const fileName = text(input.fileName);
  const dataUrl = text(input.dataUrl);
  if (!fileName || !dataUrl) throw new Error("附件文件不能为空");
  const context = await statementStorageContext(snapshotNo);
  const attachmentId = randomUUID();
  const fileType = text(input.fileType) || "application/octet-stream";
  const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
  const bytes = match ? Buffer.from(match[2], "base64") : Buffer.from(dataUrl, "utf8");
  const stored = await storeFile({
    context,
    attachmentId,
    fileName,
    fileType,
    bytes,
    isInvoice: /发票|invoice/i.test(fileName) || /^inv[_\-\s]/i.test(fileName),
  });
  await executeRaw(
    `INSERT INTO ${TABLE}
       (id, snapshotNo, fileName, fileType, fileSize, dataUrl, storageProvider, storageKey, description, uploadedByUserId, uploadedByName)
     VALUES (:id, :snapshotNo, :fileName, :fileType, :fileSize, :dataUrl, :storageProvider, :storageKey, :description, :userId, :userName)`,
    {
      id: attachmentId,
      snapshotNo,
      fileName: stored.fileName,
      fileType,
      fileSize: Number(input.fileSize ?? 0) || bytes.length,
      dataUrl: stored.provider === "db" ? dataUrl : null,
      storageProvider: stored.provider,
      storageKey: stored.storageKey,
      description: text(input.description) || null,
      userId: actor?.userId ?? null,
      userName: actor?.displayName ?? null,
    },
  );
  return { id: attachmentId, fileName: stored.fileName, provider: stored.provider };
}

/** 开票时把票面挂到对账单上（按引用挂，不重复上传字节）。 */
export async function attachInvoiceFileToStatement(params: {
  snapshotNo: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  provider: string;
  storageKey: string | null;
  dataUrl: string | null;
  actor: InvoiceActorLike;
}) {
  const existing = (await queryRowsRaw<Row>(
    `SELECT id FROM ${TABLE} WHERE snapshotNo = :snapshotNo AND fileName = :fileName LIMIT 1`,
    { snapshotNo: params.snapshotNo, fileName: params.fileName },
  ))[0];
  const id = text(existing?.id) || randomUUID();
  const common = {
    id,
    snapshotNo: params.snapshotNo,
    fileName: params.fileName,
    fileType: params.fileType,
    fileSize: params.fileSize,
    dataUrl: params.dataUrl,
    storageProvider: params.provider,
    storageKey: params.storageKey,
  };
  if (existing) {
    await executeRaw(
      `UPDATE ${TABLE} SET fileType = :fileType, fileSize = :fileSize, dataUrl = :dataUrl,
          storageProvider = :storageProvider, storageKey = :storageKey, updatedAt = NOW() WHERE id = :id`,
      common,
    );
  } else {
    await executeRaw(
      `INSERT INTO ${TABLE}
         (id, snapshotNo, fileName, fileType, fileSize, dataUrl, storageProvider, storageKey, description, uploadedByUserId, uploadedByName)
       VALUES (:id, :snapshotNo, :fileName, :fileType, :fileSize, :dataUrl, :storageProvider, :storageKey, '系统开票票面', :userId, :userName)`,
      { ...common, userId: text(params.actor.userId) || null, userName: text(params.actor.name) || text(params.actor.displayName) || "开票功能" },
    );
  }
  return id;
}

export async function readStatementAttachment(snapshotNo: string, attachmentId: string) {
  const row = (await queryRowsRaw<Row>(
    `SELECT fileName, fileType, dataUrl, storageProvider, storageKey FROM ${TABLE}
      WHERE id = :attachmentId AND snapshotNo = :snapshotNo LIMIT 1`,
    { attachmentId, snapshotNo },
  ))[0];
  if (!row) return null;
  const file = await readFile({
    dataUrl: row.dataUrl,
    storageProvider: row.storageProvider,
    storageKey: row.storageKey,
    fileType: row.fileType,
  });
  if (!file) return null;
  return { bytes: file.bytes, contentType: file.contentType, fileName: text(row.fileName) || "attachment" };
}

export async function deleteStatementAttachment(snapshotNo: string, attachmentId: string) {
  const row = (await queryRowsRaw<Row>(
    `SELECT storageProvider, storageKey FROM ${TABLE} WHERE id = :attachmentId AND snapshotNo = :snapshotNo LIMIT 1`,
    { attachmentId, snapshotNo },
  ))[0];
  if (!row) throw new Error("附件不存在");
  await executeRaw(`DELETE FROM ${TABLE} WHERE id = :attachmentId AND snapshotNo = :snapshotNo`, { attachmentId, snapshotNo });
  // OBS 对象被别处引用时不会被删（见 deleteFileObject 的引用检查）
  await deleteFileObject({ storageProvider: row.storageProvider, storageKey: row.storageKey }).catch(() => undefined);
  return true;
}
