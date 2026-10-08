import { queryRowsRaw, type Row } from "./db";
import { buildStoragePrefix, type StorageContext } from "./file-storage-service";
import { resolveCloudAttachmentContext, resolveCommonAttachmentContext, resolveDocumentContext, resolveSettlementContext } from "./file-storage-service";
import type { PermissionState } from "./permission-definitions";
import { hasPermission } from "./permission-definitions";

/**
 * 文档库 → 云盘目录汇总。
 *
 * 把散在各模块（业务伙伴 / 集采项目结算 / 华为云 / 文档库）的附件按**统一目录规则**
 * 汇总成一棵树，并标注每个文件当前存放位置：
 *   - `obs`：已经迁到华为云 OBS；
 *   - `db` ：仍在数据库里（OBS 未启用或还没迁移）。
 *
 * 这样在 OBS 写权限到位、迁移脚本跑完之前，也能一眼看清"文件都该在哪里"。
 */

export type CloudDriveFile = {
  key: string;
  fileName: string;
  fileSize: number;
  uploadedByName: string;
  uploadedAt: string;
  prefix: string;
  directory: string;
  provider: "obs" | "db";
  storageKey: string | null;
  source: "common" | "cloud" | "settlement" | "documents" | "billing-statement";
  sourceLabel: string;
  ownerLabel: string;
  jumpHref: string;
  downloadHref: string;
};

export type CloudDriveFolder = {
  prefix: string;
  name: string;
  depth: number;
  fileCount: number;
  totalSize: number;
  obsCount: number;
};

const COMMON_OWNER_MODULE: Record<string, string> = {
  customers: "customers",
  suppliers: "suppliers",
  "undertaking-units": "undertaking-units",
};
const COMMON_OWNER_LABEL: Record<string, string> = {
  customers: "客户档案",
  suppliers: "供应商档案",
  "undertaking-units": "承接单位档案",
};

function directoryOf(prefix: string, fileName: string) {
  return prefix;
}

function displayNameOf(fileName: string, storageKey: string | null) {
  // 云盘上的文件名带唯一后缀（`xxx__ab12cd.pdf`），展示时去掉
  const base = storageKey ? storageKey.split("/").pop() ?? fileName : fileName;
  return base.replace(/__[0-9a-z]{6}(\.[^.]+)?$/i, "$1");
}

export async function listCloudDrive(options: { keyword?: string; prefix?: string; viewer: PermissionState }) {
  const keyword = String(options.keyword ?? "").trim().toLowerCase();
  const files: CloudDriveFile[] = [];
  const canView = (moduleKey: string) => hasPermission(options.viewer, moduleKey, "view");

  const [commonRows, cloudRows, settlementRows, documentRows, statementRows] = await Promise.all([
    queryRowsRaw<Row>(
      // 这张表的 uploadedByName / uploadedByUserId 是历史可选列，用 SELECT * 读，
      // 否则列不存在时整条查询会报错、被上层吞掉，附件就静默消失了。
      `SELECT * FROM merge_common_attachments WHERE ownerType IN ('customers','suppliers','undertaking-units')`,
    ).catch(() => [] as Row[]),
    queryRowsRaw<Row>(
      `SELECT id, ownerType, ownerId, fileName, fileSize, uploadedByName, uploadedAt, storageProvider, storageKey
         FROM merge_cloud_attachments`,
    ).catch(() => [] as Row[]),
    queryRowsRaw<Row>(
      `SELECT id, projectId, invoiceId, fileName, fileSize, uploadedByName, uploadedAt, storageProvider, storageKey
         FROM merge_po_settlement_attachments`,
    ).catch(() => [] as Row[]),
    queryRowsRaw<Row>(
      `SELECT fileId AS id, folderId, fileName, fileSize, uploadedByUserId, uploadedAt, storageProvider, storageKey
         FROM merge_common_document_files`,
    ).catch(() => [] as Row[]),
    queryRowsRaw<Row>(
      `SELECT a.id, a.snapshotNo, a.fileName, a.fileSize, a.fileType, a.uploadedByName, a.uploadedAt,
              a.storageProvider, a.storageKey, s.countryCode
         FROM merge_power_billingstatement_attachments a
         LEFT JOIN merge_power_billingstatementsnapshots s ON s.snapshotNo = a.snapshotNo`,
    ).catch(() => [] as Row[]),
  ]);

  const push = (file: CloudDriveFile) => {
    if (keyword && !`${file.fileName} ${file.prefix} ${file.ownerLabel}`.toLowerCase().includes(keyword)) return;
    if (options.prefix && !file.prefix.startsWith(options.prefix)) return;
    files.push(file);
  };

  for (const row of commonRows) {
    const ownerType = String(row.ownerType ?? "");
    const moduleKey = COMMON_OWNER_MODULE[ownerType];
    if (!moduleKey || !canView(moduleKey)) continue;
    const ownerId = String(row.ownerId ?? "");
    // 这张表的主键列名是 attachmentId（不是 id），早期版本用 row.id 会拼出缺一段的下载地址。
    const attachmentId = String(row.attachmentId ?? row.id ?? "");
    const context = await resolveCommonAttachmentContext(ownerType, ownerId);
    const prefix = buildStoragePrefix(context);
    push({
      key: `common:${attachmentId}`,
      fileName: String(row.fileName ?? ""),
      fileSize: Number(row.fileSize ?? 0),
      uploadedByName: String(row.uploadedByName ?? row.uploadedByUserId ?? "-"),
      uploadedAt: String(row.uploadedAt ?? ""),
      prefix,
      directory: directoryOf(prefix, String(row.fileName ?? "")),
      provider: String(row.storageProvider ?? "db") === "obs" ? "obs" : "db",
      storageKey: String(row.storageKey ?? "") || null,
      source: "common",
      sourceLabel: COMMON_OWNER_LABEL[ownerType] ?? "业务伙伴",
      // 关联单据列显示具体档案名（如 客户/滴滴），比只写"客户档案"更有信息量。
      ownerLabel: String(context.partyLabel ?? "") || COMMON_OWNER_LABEL[ownerType] || "",
      jumpHref: `/${ownerType}/${encodeURIComponent(ownerId)}`,
      downloadHref: `/api/common/attachments/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}/${encodeURIComponent(attachmentId)}`,
    });
  }

  if (canView("huawei-cloud")) {
    for (const row of cloudRows) {
      const ownerType = String(row.ownerType ?? "");
      const ownerId = String(row.ownerId ?? "");
      const context = await resolveCloudAttachmentContext(ownerType, ownerId);
      const prefix = buildStoragePrefix(context);
      push({
        key: `cloud:${row.id}`,
        fileName: String(row.fileName ?? ""),
        fileSize: Number(row.fileSize ?? 0),
        uploadedByName: String(row.uploadedByName ?? "-"),
        uploadedAt: String(row.uploadedAt ?? ""),
        prefix,
        directory: directoryOf(prefix, String(row.fileName ?? "")),
        provider: String(row.storageProvider ?? "db") === "obs" ? "obs" : "db",
        storageKey: String(row.storageKey ?? "") || null,
        source: "cloud",
        sourceLabel: "华为云业务",
        ownerLabel: String(context.customer ?? "") + (context.period ? ` / ${context.period}` : ""),
        jumpHref: "/cloud/reconciliation",
        downloadHref: `/api/cloud/attachments/${encodeURIComponent(String(row.id))}`,
      });
    }
  }

  if (canView("settlement-projects")) {
    for (const row of settlementRows) {
      const projectId = String(row.projectId ?? "");
      const context = await resolveSettlementContext(projectId);
      const prefix = buildStoragePrefix(context);
      push({
        key: `settlement:${row.id}`,
        fileName: String(row.fileName ?? ""),
        fileSize: Number(row.fileSize ?? 0),
        uploadedByName: String(row.uploadedByName ?? "-"),
        uploadedAt: String(row.uploadedAt ?? ""),
        prefix,
        directory: directoryOf(prefix, String(row.fileName ?? "")),
        provider: String(row.storageProvider ?? "db") === "obs" ? "obs" : "db",
        storageKey: String(row.storageKey ?? "") || null,
        source: "settlement",
        sourceLabel: row.invoiceId ? "项目结算-发票附件" : "项目结算附件",
        ownerLabel: String(context.project ?? ""),
        jumpHref: `/po/settlement-projects/${encodeURIComponent(projectId)}`,
        downloadHref: `/api/po/settlement-projects/${encodeURIComponent(projectId)}/attachments/${encodeURIComponent(String(row.id))}/download`,
      });
    }
  }

  if (canView("documents")) {
    for (const row of documentRows) {
      const context = await resolveDocumentContext(String(row.folderId ?? ""));
      const prefix = buildStoragePrefix(context);
      push({
        key: `document:${row.id}`,
        fileName: String(row.fileName ?? ""),
        fileSize: Number(row.fileSize ?? 0),
        uploadedByName: String(row.uploadedByUserId ?? "-"),
        uploadedAt: String(row.uploadedAt ?? ""),
        prefix,
        directory: directoryOf(prefix, String(row.fileName ?? "")),
        provider: String(row.storageProvider ?? "db") === "obs" ? "obs" : "db",
        storageKey: String(row.storageKey ?? "") || null,
        source: "documents",
        sourceLabel: "文档库",
        ownerLabel: String(context.folderPath ?? ""),
        jumpHref: "/documents",
        downloadHref: `/api/documents/files/${encodeURIComponent(String(row.id))}/download`,
      });
    }
  }

  // 月账单对账单附件（票面 / 外部发票）：复用算力域目录规则 cloud/算力/<国家码>/<对账单号>/
  if (canView("billing-statements")) {
    for (const row of statementRows) {
      const snapshotNo = String(row.snapshotNo ?? "");
      const prefix = buildStoragePrefix({ system: "power", country: String(row.countryCode ?? ""), requestNo: snapshotNo });
      push({
        key: `billing-statement:${row.id}`,
        fileName: String(row.fileName ?? ""),
        fileSize: Number(row.fileSize ?? 0),
        uploadedByName: String(row.uploadedByName ?? "-"),
        uploadedAt: String(row.uploadedAt ?? ""),
        prefix,
        directory: directoryOf(prefix, String(row.fileName ?? "")),
        provider: String(row.storageProvider ?? "db") === "obs" ? "obs" : "db",
        storageKey: String(row.storageKey ?? "") || null,
        source: "billing-statement",
        sourceLabel: "月账单对账单附件",
        ownerLabel: snapshotNo,
        jumpHref: "/finance/billing-statements",
        downloadHref: `/api/billing-statements/${encodeURIComponent(snapshotNo)}/attachments/${encodeURIComponent(String(row.id))}/download`,
      });
    }
  }

  // 目录树：按前缀逐级聚合
  const folderMap = new Map<string, CloudDriveFolder>();
  for (const file of files) {
    const segments = file.prefix.replace(/\/$/, "").split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const prefix = `${segments.slice(0, index).join("/")}/`;
      const folder = folderMap.get(prefix) ?? {
        prefix,
        name: segments[index - 1],
        depth: index - 1,
        fileCount: 0,
        totalSize: 0,
        obsCount: 0,
      };
      folder.fileCount += 1;
      folder.totalSize += file.fileSize;
      if (file.provider === "obs") folder.obsCount += 1;
      folderMap.set(prefix, folder);
    }
  }
  const folders = [...folderMap.values()].sort((left, right) => left.prefix.localeCompare(right.prefix));

  return {
    folders,
    files: files.sort((left, right) => left.prefix.localeCompare(right.prefix) || left.fileName.localeCompare(right.fileName)),
    summary: {
      fileCount: files.length,
      totalSize: files.reduce((sum, file) => sum + file.fileSize, 0),
      obsCount: files.filter((file) => file.provider === "obs").length,
      dbCount: files.filter((file) => file.provider === "db").length,
    },
  };
}
