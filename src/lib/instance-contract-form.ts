export type InstanceModelOption = {
  deviceCode: string;
  modelCode?: string | null;
  nameEn?: string | null;
};

export function getInstanceContractModelAutofill(
  deviceCode: string,
  instanceModels: InstanceModelOption[],
) {
  const model = instanceModels.find((item) => item.deviceCode === deviceCode);

  return {
    modelCode: model?.modelCode ?? "",
    instanceModelEn: model?.nameEn ?? "",
  };
}
