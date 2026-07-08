import { isConfirmedOrderStatus } from "./order-status";

type RequestRow = {
  requestNo: string;
  countryCode?: string | null;
  batchName?: string | null;
  status?: string | null;
  plannedDeliveryDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type RequestItemRow = {
  id: string;
  requestNo: string;
  deviceCode: string;
  supplierId: string;
  quantity?: number | string | null;
};

type InstanceModelRow = {
  deviceCode: string;
  modelCode?: string | null;
  nameEn?: string | null;
};

type SupplierRow = {
  supplierId: string;
  name?: string | null;
};

export function buildRequestProductLines({
  confirmedOnly = false,
  instanceModels,
  requestItems,
  requests,
  suppliers,
}: {
  confirmedOnly?: boolean;
  instanceModels: InstanceModelRow[];
  requestItems: RequestItemRow[];
  requests: RequestRow[];
  suppliers: SupplierRow[];
}) {
  const requestByNo = new Map(requests.map((request) => [request.requestNo, request]));
  const modelByDeviceCode = new Map(instanceModels.map((model) => [model.deviceCode, model]));
  const supplierById = new Map(suppliers.map((supplier) => [supplier.supplierId, supplier]));

  return requestItems.flatMap((item) => {
    const request = requestByNo.get(item.requestNo);
    if (confirmedOnly && !isConfirmedOrderStatus("requests", request?.status)) return [];

    const model = modelByDeviceCode.get(item.deviceCode);
    const supplier = supplierById.get(item.supplierId);

    return {
      id: item.id,
      countryCode: request?.countryCode ?? "",
      batchName: request?.batchName ?? "",
      requestNo: item.requestNo,
      deviceCode: item.deviceCode,
      modelCode: model?.modelCode ?? "",
      nameEn: model?.nameEn ?? "",
      supplierName: supplier?.name ?? item.supplierId,
      quantity: Number(item.quantity ?? 0),
      plannedDeliveryDate: request?.plannedDeliveryDate ?? "",
      createdAt: request?.createdAt ?? "",
      updatedAt: request?.updatedAt ?? "",
    };
  }).sort((left, right) => compareRequestLineTimeDesc(left, right));
}

function compareRequestLineTimeDesc(
  left: { createdAt?: string | null; updatedAt?: string | null; requestNo?: string | null; id?: string | null },
  right: { createdAt?: string | null; updatedAt?: string | null; requestNo?: string | null; id?: string | null },
) {
  const timeDiff = getTime(right.updatedAt || right.createdAt) - getTime(left.updatedAt || left.createdAt);
  if (timeDiff !== 0) return timeDiff;
  return String(right.requestNo ?? right.id ?? "").localeCompare(String(left.requestNo ?? left.id ?? ""));
}

function getTime(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
}
