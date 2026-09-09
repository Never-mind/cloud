export const INSTANCE_MODEL_TYPE_VALUES = ["Equipment", "Material", "Component"] as const;

export type InstanceModelType = (typeof INSTANCE_MODEL_TYPE_VALUES)[number];

export const INSTANCE_MODEL_TYPE_OPTIONS: Array<{ label: string; value: InstanceModelType }> = [
  { label: "设备", value: "Equipment" },
  { label: "配件", value: "Material" },
  { label: "组件", value: "Component" },
];

const INSTANCE_MODEL_TYPE_LABELS: Record<string, InstanceModelType> = {
  equipment: "Equipment",
  material: "Material",
  component: "Component",
  设备: "Equipment",
  配件: "Material",
  组件: "Component",
};

export const DEFAULT_INSTANCE_MODEL_TYPE: InstanceModelType = "Equipment";

export function normalizeInstanceModelType(value: unknown, fallback: string = DEFAULT_INSTANCE_MODEL_TYPE) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  return INSTANCE_MODEL_TYPE_LABELS[normalized.toLowerCase()] ?? INSTANCE_MODEL_TYPE_LABELS[normalized] ?? normalized;
}

export function isInstanceModelType(value: unknown): value is InstanceModelType {
  return INSTANCE_MODEL_TYPE_VALUES.includes(String(value ?? "").trim() as InstanceModelType);
}

export function requireInstanceModelType(value: unknown, fallback = DEFAULT_INSTANCE_MODEL_TYPE): InstanceModelType {
  const normalized = normalizeInstanceModelType(value, fallback);
  if (!isInstanceModelType(normalized)) {
    throw new Error("实例型号类型只能选择 Equipment（设备）、Material（配件）或 Component（组件）");
  }
  return normalized;
}

export function formatInstanceModelType(value: unknown) {
  const normalized = normalizeInstanceModelType(value, "");
  return INSTANCE_MODEL_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? (String(value ?? "").trim() || "-");
}
