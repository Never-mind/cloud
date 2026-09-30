import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  crmInvoiceStatusLabel,
  crmInvoiceTypeLabel,
  listCrmInvoices,
  listCrmReceipts,
} from "@/lib/crm-invoice-sync-service";

const RECEIPT_STATUS_LABELS: Record<string, string> = { "1": "未匹配", "2": "部分匹配", "3": "已匹配", "4": "无需处理" };

/** 导出 CRM 发票 / 回款列表（与页面同筛选口径）。 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  params.set("page", "1");
  params.set("pageSize", "200");
  try {
    if (params.get("kind") === "receipts") {
      const { items } = await listCrmReceipts(params);
      const worksheet = XLSX.utils.json_to_sheet(items.map((row) => ({
        "到账月份": row.arrivalMonth, "本地客户": row.customerName || "（未匹配）", "CRM 客户": row.customerShortName,
        "付款方": row.payerName, "币种": row.currency, "回款金额": row.receiptAmount,
        "匹配状态": RECEIPT_STATUS_LABELS[String(row.receiptStatus ?? "")] ?? "-",
        "关联发票号": row.invoiceNos, "收款银行": row.receivingBank, "收款账户": row.receivingAccountName,
        "银行流水号": row.bankSerialNo, "流水摘要": row.bankSerialSummary,
        "回填状态": row.backfillStatus, "回填说明": row.backfillNote, "同步时间": row.syncedAt,
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "CRM 回款");
      return new NextResponse(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=crm-receipts.xlsx",
        },
      });
    }
    const { items } = await listCrmInvoices(params);
    const worksheet = XLSX.utils.json_to_sheet(items.map((row) => ({
      "归属月份": row.belongMonth, "发票号": row.invoiceNo, "CRM 客户简称": row.customerShortName,
      "CRM 主体": row.customerSubjectName, "本地客户": row.customerName || "（未匹配）", "产品服务": row.productServiceName,
      "币种": row.currency, "不含税": row.amountTaxExcluded, "税额": row.taxAmount, "含税": row.amountTaxIncluded,
      "开票日期": row.invoiceDate, "账期天数": row.paymentTermDays, "到期日": row.dueDate,
      "类型": crmInvoiceTypeLabel(row.invoiceType), "状态": crmInvoiceStatusLabel(row.invoiceStatus),
      "回填状态": row.backfillStatus, "回填说明": row.backfillNote, "附件": row.attachmentUrl, "同步时间": row.syncedAt,
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "CRM 发票");
    return new NextResponse(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=crm-invoices.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导出失败" }, { status: 400 });
  }
}
