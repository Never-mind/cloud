export type BillingAdjustmentInstanceModel = {
  deviceCode: string;
  modelCode?: string | null;
  nameEn?: string | null;
};

export type BillingAdjustmentLineDraft = {
  deviceCode?: string | number | boolean | null;
  modelCode?: string | number | boolean | null;
  nameEn?: string | number | boolean | null;
  [key: string]: string | number | boolean | null | undefined;
};

export function applyBillingAdjustmentDeviceAutofill(
  item: BillingAdjustmentLineDraft,
  instanceModels: BillingAdjustmentInstanceModel[],
) {
  const deviceCode = String(item.deviceCode ?? "").trim();
  const model = instanceModels.find((option) => option.deviceCode === deviceCode);

  return {
    ...item,
    modelCode: model?.modelCode ?? "",
    nameEn: model?.nameEn ?? "",
  };
}

export function getBillingAdjustmentEditState({
  isEditing,
  isSaving,
  status,
}: {
  isEditing: boolean;
  isSaving: boolean;
  status: unknown;
}) {
  const confirmed = isConfirmedBillingAdjustmentStatus(status);
  const canEdit = !confirmed && isEditing;

  return {
    canEdit,
    confirmed,
    confirmButtonLabel: confirmed ? "已确认" : "确认调整",
    confirmDisabled: confirmed || isSaving,
    editButtonLabel: canEdit ? "保存草稿" : "修改",
    editButtonDisabled: confirmed || isSaving,
  };
}

export function isConfirmedBillingAdjustmentStatus(status: unknown) {
  const value = String(status ?? "");
  return value === "已确认" || value.includes("确认") || value.includes("纭") || value.includes("茬");
}
