export const REQUEST_TYPE_VALUES = ["整机", "备件"] as const;

export type RequestType = (typeof REQUEST_TYPE_VALUES)[number];

export const REQUEST_TYPE_OPTIONS = REQUEST_TYPE_VALUES.map((value) => ({ label: value, value }));

export function isRequestType(value: unknown): value is RequestType {
  return REQUEST_TYPE_VALUES.includes(String(value ?? "").trim() as RequestType);
}

export function requireRequestType(value: unknown): RequestType {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error("类型不能为空");
  if (!isRequestType(normalized)) throw new Error("类型只能选择整机或备件");
  return normalized;
}
