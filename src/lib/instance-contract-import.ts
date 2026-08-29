import type { Row } from "./db";

export function autofillInstanceContractImportRow(row: Row, instanceModels: Row[]) {
  const deviceCode = String(row.deviceCode ?? "").trim();
  const modelCode = String(row.modelCode ?? "").trim();
  const instanceModelEn = String(row.instanceModelEn ?? "").trim();

  // A completed import row is authoritative. Only fill fields that the user left blank.
  if (modelCode && instanceModelEn) {
    return { ...row, modelCode, instanceModelEn };
  }

  const model = instanceModels.find((item) => String(item.deviceCode ?? "").trim() === deviceCode);

  if (!model) {
    throw new Error(`设备编码 ${deviceCode} 未匹配到实例型号，请先在实例型号管理中维护该编码`);
  }

  const resolvedModelCode = modelCode || String(model.modelCode ?? "").trim();
  const resolvedInstanceModelEn = instanceModelEn || String(model.nameEn ?? "").trim();
  if (!resolvedModelCode || !resolvedInstanceModelEn) {
    throw new Error(`设备编码 ${deviceCode} 对应的实例型号资料不完整，请补充机型和实例型号英文`);
  }

  return {
    ...row,
    modelCode: resolvedModelCode,
    instanceModelEn: resolvedInstanceModelEn,
  };
}
