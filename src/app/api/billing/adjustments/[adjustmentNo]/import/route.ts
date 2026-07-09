import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getBillingAdjustment, saveBillingAdjustmentDraft, type BillingAdjustmentDetail } from "@/lib/billing-service";
import { type ImportReport } from "@/lib/entity-import";

const fieldByLabel: Record<string, keyof BillingAdjustmentDetail> = {
  国家: "countryCode",
  批次号: "batchName",
  需求单号: "requestNo",
  PO单号: "poNo",
  实例编码: "deviceCode",
  机型: "modelCode",
  英文名称: "nameEn",
  数量: "quantity",
  币种: "currency",
  生效月份: "effectiveMonth",
  调整后前24个月价: "adjustedFirst24MonthPrice",
  调整后后36个月价: "adjustedNext36MonthPrice",
};

export async function POST(request: NextRequest, context: { params: Promise<{ adjustmentNo: string }> }) {
  try {
    const { adjustmentNo: rawAdjustmentNo } = await context.params;
    const adjustmentNo = decodeURIComponent(rawAdjustmentNo);
    const formData = await request.formData();
    const file = formData.get("file");
    const instanceContractNo = String(formData.get("instanceContractNo") ?? "");
    const reason = String(formData.get("reason") ?? "");
    const replace = String(formData.get("replace") ?? "true") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择导入文件" }, { status: 400 });
    }

    const existing = await getBillingAdjustment(adjustmentNo);
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    const report: ImportReport = { total: rows.length, success: 0, failed: [] };
    const importedItems: BillingAdjustmentDetail[] = [];

    rows.forEach((row, index) => {
      try {
        const item: Record<string, unknown> = {};
        for (const [label, key] of Object.entries(fieldByLabel)) {
          item[key] = row[label] ?? "";
        }
        if (!String(item.countryCode ?? "").trim()) throw new Error("国家不能为空");
        if (!String(item.batchName ?? "").trim()) throw new Error("批次号不能为空");
        if (!String(item.deviceCode ?? "").trim()) throw new Error("实例编码不能为空");
        if (!String(item.currency ?? "").trim()) throw new Error("币种不能为空");
        if (!String(item.effectiveMonth ?? "").trim()) throw new Error("生效月份不能为空");
        importedItems.push(item as BillingAdjustmentDetail);
        report.success += 1;
      } catch (error) {
        report.failed.push({
          rowNumber: index + 2,
          primaryKey: String(row["实例编码"] ?? ""),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    const items = replace ? importedItems : [...((existing.items as BillingAdjustmentDetail[]) ?? []), ...importedItems];
    const data = await saveBillingAdjustmentDraft({
      adjustmentNo,
      instanceContractNo: instanceContractNo || String(existing.adjustment?.instanceContractNo ?? ""),
      reason: reason || String(existing.adjustment?.reason ?? ""),
      items,
    });

    return NextResponse.json({ ...data, report });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 });
  }
}
