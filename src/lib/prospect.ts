export const PROSPECT_STATUSES = [
  { value: "new", label: "待联系" }, { value: "following", label: "跟进中" },
  { value: "paused", label: "暂缓" }, { value: "converted", label: "已转化" }, { value: "closed", label: "已终止" },
] as const;
export type ProspectStatus = typeof PROSPECT_STATUSES[number]["value"];
export type ProspectValues = Record<string, string | number | null>;
export const PROSPECT_FIELDS = ["name", "nameEn", "shortName", "country", "city", "address", "taxNumber", "contactName", "contactPhone", "contactEmail", "source", "ownerName", "status", "nextFollowUpDate", "remark"] as const;
export function identityKey(value: unknown) { return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ""); }
export function validProspectDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) throw new Error("日期格式无效");
  return raw;
}
export function normalizeProspect(input: Record<string, unknown>): ProspectValues {
  const values: ProspectValues = {};
  for (const key of PROSPECT_FIELDS) {
    const value = String(input[key] ?? "").trim();
    const limit = ["address", "remark"].includes(key) ? 10000 : ["country", "city", "taxNumber", "contactPhone"].includes(key) ? 100 : 255;
    if (value.length > limit) throw new Error(`${key}内容过长`);
    values[key] = value || null;
  }
  if (!values.name) throw new Error("请填写公司名称");
  values.status ||= "new";
  if (!PROSPECT_STATUSES.some(s => s.value === values.status) || values.status === "converted") throw new Error("请通过“转为客户”完成转化");
  values.nextFollowUpDate = validProspectDate(values.nextFollowUpDate);
  return values;
}
export function customerMatchReasons(input: Record<string, unknown>, customer: Record<string, unknown>) {
  const reasons: string[] = [];
  const tax = identityKey(input.taxNumber);
  if (tax && tax === identityKey(customer.taxNumber)) reasons.push("税号相同");
  const names = [input.name, input.nameEn].map(identityKey).filter(Boolean);
  if ([customer.name, customer.nameCn, customer.nameEn].some(n => names.includes(identityKey(n)))) reasons.push("公司名称相同");
  return reasons;
}
export function nextCustomerCode(codes: unknown[]) {
  const max = codes.reduce<number>((n, code) => Math.max(n, Number(/^custom(\d+)$/i.exec(String(code))?.[1] || 0)), 0);
  return `custom${max + 1}`;
}
export function normalizeProspectCustomer(input: Record<string, unknown>, prospect: Record<string, unknown>): ProspectValues {
  const result: ProspectValues = {};
  for (const key of ["name", "nameEn", "shortName", "country", "city", "address", "taxNumber", "contactName", "contactPhone", "contactEmail", "taxRegime", "postCode", "businessTypes", "website", "remark"]) {
    const value = String(input[key] ?? prospect[key] ?? "").trim();
    const limit = ["address", "remark", "businessTypes"].includes(key) ? 10000 : key === "postCode" ? 32 : ["taxNumber", "country", "city", "contactPhone"].includes(key) ? 100 : key === "website" ? 500 : 255;
    if (value.length > limit) throw new Error(`${key}内容过长`);
    result[key] = value || null;
  }
  if (!result.name) throw new Error("请填写客户全称");
  const days = input.paymentTermDays === "" || input.paymentTermDays == null ? 30 : Number(input.paymentTermDays);
  if (!Number.isInteger(days) || days < 0 || days > 3650) throw new Error("账期须为0至3650天的整数");
  return { ...result, nameCn: result.name, status: "active", cooperationStatus: "normal", paymentTermDays: days };
}
