/** Business source and Feishu cost project are independent, even when their defaults match. */
export type CostPaymentProject = "huawei" | "other" | "compute";
export const COST_PAYMENT_PROJECT_LABELS: Record<CostPaymentProject, string> = { huawei: "华为云", other: "其他", compute: "算力" };
export const COST_PAYMENT_SOURCE_LABELS: Record<CostPaymentProject, string> = { huawei: "华为云供应商付款", other: "集采付款", compute: "算力采购订单" };
export const COST_PAYMENT_PROJECT_KEYS: Record<CostPaymentProject, string> = {
  huawei: "mkm9capp-w1hyx3b3i3o-0", other: "mkm9d6gc-qj9dr11qw2d-1", compute: "mkm9capp-x50k57e3ab-0",
};
export const COST_PAYMENT_LIST_WIDGETS: Record<CostPaymentProject, string> = {
  huawei: "widget17688936313800001", other: "widget17688942726490001", compute: "widget17688927004010001",
};

type Option = { value: string; text: string };
/** Option IDs differ between Feishu branches. Never reuse a source branch's ID blindly. */
export function remapCostPaymentOption(value: string, previous: Option[], next: Option[]) {
  if (next.some(option => option.value === value)) return value;
  const label = previous.find(option => option.value === value)?.text.trim();
  return label ? next.find(option => option.text.trim() === label)?.value ?? "" : "";
}

/** Use the immutable submitted form, not today's business-source default. */
export function costPaymentProjectLabel(formJson: unknown) {
  try {
    const form = typeof formJson === "string" ? JSON.parse(formJson) : formJson;
    if (!Array.isArray(form)) return "";
    const selected = form.find(item => item?.id === "widget17688932030050001")?.value;
    const known = (Object.keys(COST_PAYMENT_PROJECT_KEYS) as CostPaymentProject[]).find(key => COST_PAYMENT_PROJECT_KEYS[key] === selected);
    if (known) return COST_PAYMENT_PROJECT_LABELS[known];
    const lists = (Object.keys(COST_PAYMENT_LIST_WIDGETS) as CostPaymentProject[]).filter(key => form.some(item => item?.id === COST_PAYMENT_LIST_WIDGETS[key] && Array.isArray(item.value) && item.value.length));
    return lists.length === 1 ? COST_PAYMENT_PROJECT_LABELS[lists[0]] : "";
  } catch { return ""; }
}

// The joined approval table uses this alias in all three source modules.
const validForm = "IF(JSON_VALID(paymentApproval.formJson), paymentApproval.formJson, '[]')";
export const COST_PAYMENT_PROJECT_LABEL_SQL = `(CASE ${Object.entries(COST_PAYMENT_PROJECT_KEYS).map(([key, value]) =>
  `WHEN JSON_CONTAINS(${validForm}, JSON_OBJECT('id', 'widget17688932030050001', 'value', '${value}')) THEN '${COST_PAYMENT_PROJECT_LABELS[key as CostPaymentProject]}'`).join(" ")} ${Object.entries(COST_PAYMENT_LIST_WIDGETS).map(([key, id]) =>
  `WHEN JSON_CONTAINS(${validForm}, JSON_OBJECT('id', '${id}')) AND ${Object.values(COST_PAYMENT_LIST_WIDGETS).filter(other => other !== id).map(other => `NOT JSON_CONTAINS(${validForm}, JSON_OBJECT('id', '${other}'))`).join(" AND ")} THEN '${COST_PAYMENT_PROJECT_LABELS[key as CostPaymentProject]}'`).join(" ")} ELSE NULL END)`;
