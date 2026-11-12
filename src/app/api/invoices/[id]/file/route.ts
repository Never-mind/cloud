import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { readInvoiceFile, renderInvoiceHtmlById } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 下载票面 / 外部发票文件。OBS 启用时服务端代理转发，否则读数据库里的 base64。 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "view")) {
      return NextResponse.json({ error: "没有查看权限" }, { status: 403 });
    }
    const { id } = await context.params;
    const invoiceId = decodeURIComponent(id);
    const inline = request.nextUrl.searchParams.get("inline") === "1";
    // format=html：按需渲染票面 HTML（默认给的是 PDF）
    if (request.nextUrl.searchParams.get("format") === "html") {
      const html = await renderInvoiceHtmlById(invoiceId);
      if (!html) return NextResponse.json({ error: "票面不存在" }, { status: 404 });
      return new NextResponse(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `${inline ? "inline" : "attachment"}; filename="invoice.html"`,
          "cache-control": "no-store",
        },
      });
    }
    const file = await readInvoiceFile(invoiceId);
    if (!file) return NextResponse.json({ error: "发票文件不存在" }, { status: 404 });
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "content-type": file.contentType || "application/octet-stream",
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.fileName)}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "下载失败" }, { status: (error as { status?: number })?.status === 503 ? 503 : 400 });
  }
}
