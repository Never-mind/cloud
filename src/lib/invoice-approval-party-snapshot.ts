export type InvoiceApprovalPartySnapshot = {
  customerId: string; undertakingUnitId: string;
  customer: Record<string, unknown>; sellerName: string; paymentTermDays: number;
};
export function readApprovalPartySnapshot(value: unknown): InvoiceApprovalPartySnapshot | null {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object" || typeof parsed.customerId !== "string" || typeof parsed.undertakingUnitId !== "string"
      || !parsed.customer || typeof parsed.customer !== "object" || Array.isArray(parsed.customer) || typeof parsed.sellerName !== "string") return null;
    return parsed as InvoiceApprovalPartySnapshot;
  } catch { return null; }
}
