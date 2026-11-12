/** Inspect actual bytes: a PDF suffix/MIME alone must never make HTML a PDF. */
export function isPdfFile(bytes: Buffer) {
  return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function isHtmlFile(bytes: Buffer) {
  return /<(?:!doctype\s+html|html\b|head\b)/i.test(bytes.subarray(0, 4096).toString("utf8"));
}

export function invoicePdfFileName(fileName: string, invoiceNo: string) {
  const base = fileName.replace(/\.(?:html?|pdf)$/i, "") || invoiceNo || "invoice";
  return `${base.replace(/[\\/\x00-\x1f:*?"<>|]/g, "_")}.pdf`;
}
