import { NextRequest, NextResponse } from "next/server";
import {
  crmInvoiceStatusLabel,
  crmInvoiceTypeLabel,
  getInvoiceAllocationPlan,
  latestCrmSyncRun,
  listCrmCustomerIdentities,
  listCrmInvoices,
  listCrmReceipts,
  searchCrmInvoicesForMatching,
} from "@/lib/crm-invoice-sync-service";

const RECEIPT_STATUS_LABELS: Record<string, string> = { "1": "未匹配", "2": "部分匹配", "3": "已匹配", "4": "无需处理" };
const BACKFILL_LABELS: Record<string, string> = {
  pending: "待同步",
  backfilled: "已回填",
  mismatch: "与本地不一致",
  unmatched: "未匹配",
  void: "已作废",
  skipped: "已跳过",
};

function decorateInvoice(row: Record<string, unknown>) {
  const allocationCount = Number(row.allocationCount ?? 0);
  const suggestionCount = String(row.suggestionRowIds ?? "").split(",").filter(Boolean).length;
  return {
    ...row,
    invoiceStatusLabel: crmInvoiceStatusLabel(row.invoiceStatus),
    invoiceTypeLabel: crmInvoiceTypeLabel(row.invoiceType),
    backfillStatusLabel: BACKFILL_LABELS[String(row.backfillStatus ?? "")] ?? "-",
    allocationCount,
    suggestionCount,
    allocationLabel: allocationCount ? `已拆 ${allocationCount} 行` : suggestionCount ? `建议拆 ${suggestionCount} 行` : "",
  };
}

function decorateReceipt(row: Record<string, unknown>) {
  return {
    ...row,
    receiptStatusLabel: RECEIPT_STATUS_LABELS[String(row.receiptStatus ?? "")] ?? "-",
    backfillStatusLabel: BACKFILL_LABELS[String(row.backfillStatus ?? "")] ?? "-",
  };
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("view") === "mappings") return NextResponse.json({ items: await listCrmCustomerIdentities() });
    if (params.get("view") === "last-run") return NextResponse.json({ run: await latestCrmSyncRun() });
    // 匹配/分摊弹层：候选对账行、当前分摊、系统建议
    if (params.get("view") === "allocation-plan") return NextResponse.json(await getInvoiceAllocationPlan(params.get("crmInvoiceId")));
    // 编辑客户开票时的发票搜索：按发票号 / 客户 / 主体模糊搜
    if (params.get("view") === "search") return NextResponse.json({ items: (await searchCrmInvoicesForMatching(params)).map(decorateInvoice) });
    if (params.get("kind") === "receipts") {
      const result = await listCrmReceipts(params);
      return NextResponse.json({ ...result, items: result.items.map(decorateReceipt) });
    }
    const result = await listCrmInvoices(params);
    return NextResponse.json({ ...result, items: result.items.map(decorateInvoice) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CRM 发票加载失败" }, { status: 500 });
  }
}
