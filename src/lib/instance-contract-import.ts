import type { Row } from "./db";

export function autofillInstanceContractImportRow(row: Row, instanceModels: Row[]) {
  const deviceCode = String(row.deviceCode ?? "").trim();
  const model = instanceModels.find((item) => String(item.deviceCode ?? "").trim() === deviceCode);

  if (!model) {
    throw new Error(`设备编码 ${deviceCode} 未匹配到实例型号，请先在实例型号管理中维护该编码`);
  }

  return {
    ...row,
    modelCode: String(model.modelCode ?? ""),
    instanceModelEn: String(model.nameEn ?? ""),
  };
}
