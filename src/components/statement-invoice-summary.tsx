import { formatDisplayValue } from "@/lib/display-format";

function dateText(value: unknown) {
  const date = value instanceof Date ? value : String(value ?? "").trim();
  return date ? formatDisplayValue(date, "date") : "—";
}

export function StatementInvoiceSummary({ invoiceNo, invoiceDate, receivableDate, collectionDate }: {
  invoiceNo: unknown;
  invoiceDate: unknown;
  receivableDate: unknown;
  collectionDate: unknown;
}) {
  const fields = [
    { label: "发票号", value: String(invoiceNo ?? "").trim() || "—", className: "col-span-full lg:col-span-1" },
    { label: "开票日期", value: dateText(invoiceDate) },
    { label: "应收日期", value: dateText(receivableDate) },
    { label: "实收日期", value: dateText(collectionDate), className: "col-span-full sm:col-span-1" },
  ];

  return <section aria-label="发票与收款日期" className="overflow-hidden rounded border border-line-soft">
    <h3 className="border-b border-line-soft bg-canvas px-3 py-2 text-xs font-medium text-ink-2">发票与收款日期</h3>
    <dl className="grid grid-cols-2 gap-px bg-line-soft sm:grid-cols-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(0,1fr))]">
      {fields.map((field) => <div className={`min-w-0 bg-white px-3 py-2 ${field.className ?? ""}`} key={field.label}>
        <dt className="text-[11px] text-ink-3">{field.label}</dt>
        <dd className="mt-0.5 select-text whitespace-normal text-xs text-ink [overflow-wrap:anywhere]">{field.value}</dd>
      </div>)}
    </dl>
  </section>;
}
