import { execute, queryRows, type Row } from "./db";

export async function deleteCustomerPoDraft(id: string) {
  const rows = await queryRows<Row>("SELECT id, status FROM po_customer_pos WHERE id = :id LIMIT 1", { id });
  const po = rows[0];
  if (!po) throw new Error("客户PO不存在");
  if (String(po.status ?? "draft") === "confirmed") throw new Error("已完成的客户PO不能删除");

  await execute("DELETE FROM po_customer_po_items WHERE poId = :id", { id });
  await execute("DELETE FROM po_customer_pos WHERE id = :id", { id });
}

export async function deleteQuotationDraft(id: string) {
  const rows = await queryRows<Row>("SELECT id, status FROM po_quotations WHERE id = :id LIMIT 1", { id });
  const quotation = rows[0];
  if (!quotation) throw new Error("报价单不存在");
  if (String(quotation.status ?? "draft") === "confirmed") throw new Error("已完成的报价单不能删除");

  const settlements = await queryRows<Row>(
    "SELECT id FROM po_settlement_projects WHERE quotationId = :quotationId LIMIT 1",
    { quotationId: id },
  );
  if (settlements.length) throw new Error("该报价单已生成项目结算，不能删除");

  await execute("DELETE FROM po_quotation_items WHERE quotationId = :id", { id });
  await execute("DELETE FROM po_quotations WHERE id = :id", { id });
}
