import { NextResponse } from "next/server";
import type { Row } from "./db";
import { readFile } from "./file-storage-service";

/**
 * 华为云附件的下载响应：附件内容以 base64 dataUrl 存在库里，这里还原成文件流。
 *
 * 单段地址 `/api/cloud/attachments/<附件ID>` 与（兼容用）两段地址都会走到这里，
 * 保证"点下载"始终能拿到文件，而不是一个空 JSON。
 */
export async function cloudAttachmentResponse(attachment: Row) {
  // OBS 上的文件从对象存储取，老数据仍从 dataUrl 解出来（双读兼容）
  const file = await readFile(attachment);
  if (!file) return NextResponse.json({ error: "附件内容不存在" }, { status: 404 });
  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.contentType || String(attachment.fileType || "application/octet-stream"),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(String(attachment.fileName).replace(/[\r\n"]/g, "_"))}`,
    },
  });
}
