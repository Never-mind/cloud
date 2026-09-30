import { NextResponse } from "next/server";
import type { Row } from "./db";

/**
 * 华为云附件的下载响应：附件内容以 base64 dataUrl 存在库里，这里还原成文件流。
 *
 * 单段地址 `/api/cloud/attachments/<附件ID>` 与（兼容用）两段地址都会走到这里，
 * 保证"点下载"始终能拿到文件，而不是一个空 JSON。
 */
export function cloudAttachmentResponse(attachment: Row) {
  const match = String(attachment.dataUrl ?? "").match(/^data:([^;,]+)?;base64,([\s\S]*)$/);
  const buffer = match ? Buffer.from(match[2], "base64") : Buffer.from(String(attachment.dataUrl ?? ""));
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": String(attachment.fileType || match?.[1] || "application/octet-stream"),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(attachment.fileName).replace(/[\r\n"]/g, "_"))}`,
    },
  });
}
