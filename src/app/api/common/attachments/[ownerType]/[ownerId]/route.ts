import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { queryRowsRaw, executeRaw } from "@/lib/db";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { hasPermission, type PermissionAction } from "@/lib/permission-definitions";

const OWNER_MODULES: Record<string, string> = {
  suppliers: "suppliers",
  customers: "customers",
  "undertaking-units": "undertaking-units",
};

function getModuleKey(ownerType: string) {
  const moduleKey = OWNER_MODULES[ownerType];
  if (!moduleKey) throw new Error("不支持的公共档案类型");
  return moduleKey;
}

async function requireAccess(request: NextRequest, ownerType: string, action: PermissionAction) {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const state = await getPermissionStateForEmail(email);
  if (!hasPermission(state, getModuleKey(ownerType), action)) throw new Error("当前账号没有执行该操作的权限");
}

export async function GET(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  try {
    const { ownerType, ownerId } = await context.params;
    await requireAccess(request, ownerType, "view");
    const rows = await queryRowsRaw(
      `SELECT attachmentId, ownerType, ownerId, fileName, fileType, fileSize, uploadedAt, createdAt, updatedAt
       FROM common_attachments WHERE ownerType = :ownerType AND ownerId = :ownerId
       ORDER BY uploadedAt DESC, fileName ASC`,
      { ownerType, ownerId },
    );
    return NextResponse.json({ attachments: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件加载失败";
    return NextResponse.json({ error: message }, { status: message === "未登录" ? 401 : 403 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string }> }) {
  try {
    const { ownerType, ownerId } = await context.params;
    await requireAccess(request, ownerType, "create");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择附件" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "单个附件不能超过 10 MB" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const attachmentId = randomUUID();
    const dataUrl = `data:${file.type || "application/octet-stream"};base64,${bytes.toString("base64")}`;
    const email = getAuthenticatedUserEmail(request);
    const optionalColumns = await queryRowsRaw<{ columnName: string }>(
      `SELECT COLUMN_NAME AS columnName
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'common_attachments'
          AND COLUMN_NAME IN ('uploadedByUserId', 'uploadedByName')`,
    );
    const availableColumns = new Set(optionalColumns.map((column) => column.columnName));
    const user = availableColumns.size && email
      ? (await queryRowsRaw<{ userId: string; displayName: string }>(
        "SELECT userId, displayName FROM common_users WHERE email = :email LIMIT 1",
        { email },
      ))[0]
      : null;
    const insertFields = ["attachmentId", "ownerType", "ownerId", "fileName", "fileType", "fileSize", "dataUrl"];
    const insertParams: Record<string, string | number | null> = {
      attachmentId,
      ownerType,
      ownerId,
      fileName: file.name.slice(0, 255),
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      dataUrl,
    };
    if (availableColumns.has("uploadedByUserId")) {
      insertFields.push("uploadedByUserId");
      insertParams.uploadedByUserId = user?.userId ?? null;
    }
    if (availableColumns.has("uploadedByName")) {
      insertFields.push("uploadedByName");
      insertParams.uploadedByName = user?.displayName ?? null;
    }
    await executeRaw(
      `INSERT INTO common_attachments
        (${insertFields.join(", ")})
       VALUES (${insertFields.map((field) => `:${field}`).join(", ")})`,
      insertParams,
    );
    return NextResponse.json({ attachmentId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件上传失败";
    return NextResponse.json({ error: message }, { status: message === "未登录" ? 401 : 400 });
  }
}
