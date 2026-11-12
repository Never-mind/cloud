import { centsText, moneyCents } from "./invoice-allocation";

/** Accept unambiguous pasted amounts; currency symbols and decimal commas stay invalid. */
export function normalizeInvoiceMoneyInput(value: unknown): string {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error("请填写有效金额，例如 11516.54");
  return centsText(moneyCents(text.replaceAll(",", "")));
}
