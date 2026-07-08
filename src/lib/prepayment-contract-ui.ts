export function getPrepaymentContractEditState({
  isConfirming,
  isEditing,
  isSaving,
  status,
}: {
  isConfirming: boolean;
  isEditing: boolean;
  isSaving: boolean;
  status: unknown;
}) {
  const confirmed = isConfirmedPrepaymentStatus(status);
  const canEdit = !confirmed && isEditing;

  return {
    canEdit,
    confirmed,
    confirmButtonLabel: confirmed || isConfirming ? "已确认" : "确认合同",
    confirmDisabled: confirmed || isSaving || isConfirming,
    editButtonLabel: canEdit ? "保存草稿" : "修改",
    editButtonDisabled: confirmed || isSaving || isConfirming,
  };
}

export function isConfirmedPrepaymentStatus(status: unknown) {
  const value = String(status ?? "");
  return value === "已确认" || value.includes("确认") || value.includes("纭") || value.includes("茬");
}
