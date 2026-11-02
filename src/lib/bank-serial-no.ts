/** Bank references are identifiers, never numbers: retain leading zeroes and case. */
export function normalizeBankSerialNo(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("银行流水号请使用文本，避免丢失前导零或长编号精度");
  const serial = value.trim();
  if (serial.length > 255) throw new Error("银行流水号不能超过 255 个字符");
  return serial || null;
}
