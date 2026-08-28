import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { executeRaw, queryRowsRaw } from "@/lib/db";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { hasPermission } from "@/lib/permission-definitions";

const OWNER_MODULES: Record<string, string> = {
  suppliers: "suppliers",
  customers: "customers",
  "undertaking-units": "undertaking-units",
};

async function getAccess(request: NextRequest, ownerType: string, action: "view" | "delete") {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const moduleKey = OWNER_MODULES[ownerType];
  if (!moduleKey) throw new Error("不支持的公共档案类型");
  const state = await getPermissionStateForEmail(email);
  if (!hasPermission(state, moduleKey, action)) throw new Error("当前账号没有执行该操作的权限");
}

async function findAttachment(ownerType: string, ownerId: string, attachmentId: string) {
  return (await queryRowsRaw<{ attachmentId: string; fileName: string; fileType: string | null; dataUrl: string }>(
    `SELECT attachmentId, fileName, fileType, dataUrl FROM common_attachments
     WHERE attachmentId = :attachmentId AND ownerType = :ownerType AND ownerId = :ownerId LIMIT 1`,
    { attachmentId, ownerType, ownerId },
  ))[0];
}

export async function GET(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string; attachmentId: string }> }) {
  try {
    const { ownerType, ownerId, attachmentId } = await context.params;
    await getAccess(request, ownerType, "view");
    const attachment = await findAttachment(ownerType, ownerId, attachmentId);
    if (!attachment) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
    const match = attachment.dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
    const bytes = Buffer.from(match?.[2] ?? attachment.dataUrl, "base64");
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": match?.[1] ?? attachment.fileType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件下载失败";
    return NextResponse.json({ error: message }, { status: message === "未登录" ? 401 : 403 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ ownerType: string; ownerId: string; attachmentId: string }> }) {
  try {
    const { ownerType, ownerId, attachmentId } = await context.params;
    await getAccess(request, ownerType, "delete");
    await executeRaw(
      "DELETE FROM common_attachments WHERE attachmentId = :attachmentId AND ownerType = :ownerType AND ownerId = :ownerId",
      { attachmentId, ownerType, ownerId },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "附件删除失败";
    return NextResponse.json({ error: message }, { status: message === "未登录" ? 401 : 400 });
  }
}
