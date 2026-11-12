import { queryRowsRaw } from "./db";
import { readFile, type StoredFileRecord } from "./file-storage-service";
import { invoicePdfFileName, isHtmlFile } from "./invoice-file-format";
import { renderInvoicePdf } from "./invoice-pdf";

/** Only convert an exact archived local-invoice file; uploaded HTML remains an original attachment. */
export async function readInvoiceAttachmentFile(record: StoredFileRecord) {
  const file = await readFile(record);
  if (!file) return null;
  const original = { ...file, fileName: String(record.fileName || "attachment") };
  if (!isHtmlFile(file.bytes)) return original;
  const storageKey = String(record.storageKey || "").trim();
  const dataUrl = String(record.dataUrl || "");
  const usesObs = record.storageProvider === "obs" && Boolean(storageKey);
  if (!usesObs && !dataUrl) return original;
  const [invoice] = await queryRowsRaw<{ invoiceNo: string }>(
    `SELECT invoiceNo FROM merge_common_invoices WHERE source='generated' AND ${usesObs
      ? "fileProvider='obs' AND storageKey=:storageKey"
      : "COALESCE(fileProvider,'db')<>'obs' AND fileContent=:dataUrl"} LIMIT 1`,
    usesObs ? { storageKey } : { dataUrl },
  );
  if (!invoice) return original;
  return {
    bytes: await renderInvoicePdf(file.bytes.toString("utf8")),
    contentType: "application/pdf",
    fileName: invoicePdfFileName(original.fileName, invoice.invoiceNo),
  };
}
