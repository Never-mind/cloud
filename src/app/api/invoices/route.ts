import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { getOperationActor } from "@/lib/operation-actor";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";
import { listInvoices, saveInvoice, type InvoiceDraftInput, type InvoiceLinePayload } from "@/lib/invoice-service";

/** 发票台账：GET 列表；POST 新建（系统生成票面 / 外部发票登记）。 */

async function requireInvoiceAccess(request: NextRequest, action: "view" | "create") {
  const email = getAuthenticatedUserEmail(request);
  if (!email) throw new Error("未登录");
  const state = await getPermissionStateForEmail(email);
  if (!hasPermission(state, "invoices", action)) throw new Error("当前账号没有发票管理的操作权限");
}

export async function GET(request: NextRequest) {
  try {
    await requireInvoiceAccess(request, "view");
    const params = request.nextUrl.searchParams;
    const result = await listInvoices({
      keyword: params.get("keyword") ?? "",
      period: params.get("period") ?? "",
      source: params.get("source") ?? "",
      status: params.get("status") ?? "",
      customerId: params.get("customerId") ?? "",
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 20),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "发票列表加载失败" }, { status: 400 });
  }
}

function parseLines(raw: unknown): InvoiceLinePayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((line) => {
    const item = (line ?? {}) as Record<string, unknown>;
    return {
      periodLabel: item.periodLabel as string | undefined,
      description: item.description as string | undefined,
      amount: item.amount as string | number | undefined,
      sgdRate: item.sgdRate as string | number | undefined,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireInvoiceAccess(request, "create");
    const actor = await getOperationActor(request);
    const contentType = request.headers.get("content-type") ?? "";
    let input: InvoiceDraftInput;

    const operationActor = { userId: actor?.userId ?? null, name: actor?.displayName ?? null };
    if (contentType.includes("multipart/form-data")) {
      // 外部开票：文件 + 表单字段一起提交
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "请先上传外部发票文件" }, { status: 400 });
      input = JSON.parse(String(form.get("payload") ?? "{}")) as InvoiceDraftInput;
      input.file = {
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        bytes: Buffer.from(await file.arrayBuffer()),
      };
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      input = { ...body, lines: parseLines(body.lines) } as InvoiceDraftInput;
    }

    const invoice = await saveInvoice(input, operationActor);
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "开票失败" }, { status: 400 });
  }
}
