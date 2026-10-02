import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthenticatedUserEmail } from "@/lib/auth";
import { listInvoices } from "@/lib/invoice-service";
import { hasPermission } from "@/lib/permission-definitions";
import { getPermissionStateForEmail } from "@/lib/permission-service";

/** 发票台账导出：与列表同一套筛选口径。 */
const SOURCE_LABELS: Record<string, string> = { generated: "系统生成", external: "外部上传" };
const STATUS_LABELS: Record<string, string> = { draft: "草稿", issued: "已开票", void: "已作废" };

export async function GET(request: NextRequest) {
  try {
    const email = getAuthenticatedUserEmail(request);
    if (!email) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const state = await getPermissionStateForEmail(email);
    if (!hasPermission(state, "invoices", "export")) {
      return NextResponse.json({ error: "当前账号没有导出权限" }, { status: 403 });
    }
    const params = request.nextUrl.searchParams;
    const { rows } = await listInvoices({
      keyword: params.get("keyword") ?? "",
      period: params.get("period") ?? "",
      source: params.get("source") ?? "",
      status: params.get("status") ?? "",
      customerId: params.get("customerId") ?? "",
      page: 1,
      pageSize: 5000,
    });
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      "发票号": row.invoiceNo,
      "来源": SOURCE_LABELS[String(row.source ?? "")] ?? row.source,
      "状态": STATUS_LABELS[String(row.status ?? "")] ?? row.status,
      "客户": row.customerDisplayName ?? row.customerName,
      "开票主体": row.sellerDisplayName ?? row.sellerName,
      "客户抬头（票面快照）": row.customerName,
      "币种": row.currency,
      "未税金额": row.amountExcludingTax,
      "税率": row.taxRate,
      "税金": row.taxAmount,
      "含税金额": row.amountIncludingTax,
      "开票日期": row.invoiceDate,
      "到期日": row.dueDate,
      "账期": row.period,
      "来源单据": row.sourceNo,
      "票面模板": row.template === "sgd" ? "双币(SGD)" : "普通",
      "文件名": row.fileName,
      "存放": row.fileProvider === "obs" ? "云盘" : "数据库",
      "创建人": row.createdByName,
      "创建时间": row.createdAt,
      "作废时间": row.voidedAt,
      "作废原因": row.voidReason,
      "备注": row.remark,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "发票台账");
    return new NextResponse(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=invoices.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 400 });
  }
}
