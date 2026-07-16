type PurchaseOrderRow = {
  purchaseOrderId?: string | null;
  poNo: string;
  requestNo?: string | null;
  status?: string | null;
  currency?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type PurchaseItemRow = {
  id: string;
  purchaseOrderId?: string | null;
  poNo: string;
  requestNo?: string | null;
  requestItemId: string;
  taxExcludedUnitPrice?: number | string | null;
  taxSurcharge?: number | string | null;
  unitPrice?: number | string | null;
};

type RequestItemRow = {
  id: string;
  requestNo: string;
  deviceCode: string;
  quantity?: number | string | null;
};

type RequestRow = {
  requestNo: string;
  batchName?: string | null;
};

type InstanceModelRow = {
  deviceCode: string;
  nameZh?: string | null;
  nameEn?: string | null;
};

type PurchaseAmountLine = {
  quantity?: number | string | null;
  unitPrice?: number | string | null;
};

export const PURCHASE_PRODUCT_LINE_COLUMNS = [
  { key: "poNo", label: "采购订单号" },
  { key: "requestNo", label: "来源需求单" },
  { key: "batchName", label: "批次号" },
  { key: "status", label: "采购状态" },
  { key: "deviceCode", label: "产品实例编码" },
  { key: "nameZh", label: "中文名称" },
  { key: "nameEn", label: "英文名称" },
  { key: "quantity", label: "数量" },
  { key: "currency", label: "币种" },
  { key: "taxExcludedUnitPrice", label: "不含税单价" },
  { key: "taxSurcharge", label: "税费加成" },
  { key: "unitPrice", label: "含税单价" },
  { key: "totalAmount", label: "含税总价" },
] as const;

export type PurchaseProductLine = {
  id: string;
  poNo: string;
  requestNo: string;
  batchName: string;
  status: string;
  currency: string;
  requestItemId: string;
  deviceCode: string;
  nameZh: string;
  nameEn: string;
  quantity: number;
  taxExcludedUnitPrice: number;
  taxSurcharge: number;
  unitPrice: number;
  totalAmount: number;
};

export function buildPurchaseProductLines({
  confirmedOnly = false,
  purchaseOrders,
  purchaseItems,
  requestItems,
  requests = [],
  instanceModels,
}: {
  confirmedOnly?: boolean;
  purchaseOrders: PurchaseOrderRow[];
  purchaseItems: PurchaseItemRow[];
  requestItems: RequestItemRow[];
  requests?: RequestRow[];
  instanceModels: InstanceModelRow[];
}): PurchaseProductLine[] {
  const orderByNo = new Map(purchaseOrders.map((order) => [order.poNo, order]));
  const orderById = new Map(
    purchaseOrders
      .filter((order) => order.purchaseOrderId)
      .map((order) => [String(order.purchaseOrderId), order]),
  );
  const requestItemById = new Map(requestItems.map((item) => [item.id, item]));
  const requestByNo = new Map(requests.map((request) => [request.requestNo, request]));
  const modelByDeviceCode = new Map(instanceModels.map((model) => [model.deviceCode, model]));

  return purchaseItems.flatMap((item) => {
    const order = (item.purchaseOrderId ? orderById.get(String(item.purchaseOrderId)) : undefined) ?? orderByNo.get(item.poNo);
    if (confirmedOnly && !isConfirmedStatus(order?.status)) return [];

    const requestItem = requestItemById.get(item.requestItemId);
    const requestNo = item.requestNo ?? requestItem?.requestNo ?? order?.requestNo ?? "";
    const request = requestByNo.get(requestNo);
    const model = requestItem ? modelByDeviceCode.get(requestItem.deviceCode) : undefined;

    const quantity = Number(requestItem?.quantity ?? 0);
    const taxExcludedUnitPrice = Number(item.taxExcludedUnitPrice ?? item.unitPrice ?? 0);
    const taxSurcharge = Number(item.taxSurcharge ?? 0);
    const unitPrice = Number(item.unitPrice ?? taxExcludedUnitPrice + taxSurcharge);

    return {
      line: {
        id: item.id,
        poNo: item.poNo,
        requestNo,
        batchName: request?.batchName ?? "",
        status: order?.status ?? "",
        currency: order?.currency ?? "",
        requestItemId: item.requestItemId,
        deviceCode: requestItem?.deviceCode ?? "",
        nameZh: model?.nameZh ?? "",
        nameEn: model?.nameEn ?? "",
        quantity,
        taxExcludedUnitPrice,
        taxSurcharge,
        unitPrice,
        totalAmount: quantity * unitPrice,
      },
      sortTime: getTime(order?.updatedAt || order?.createdAt),
    };
  })
    .sort((left, right) => {
      const timeDiff = right.sortTime - left.sortTime;
      if (timeDiff !== 0) return timeDiff;
      return right.line.poNo.localeCompare(left.line.poNo);
    })
    .map((item) => item.line);
}

export function calculatePurchaseTotalAmount(lines: PurchaseAmountLine[]) {
  return lines.reduce((total, line) => {
    return total + Number(line.quantity ?? 0) * Number(line.unitPrice ?? 0);
  }, 0);
}

export function filterPurchaseProductLines<T extends PurchaseProductLine>(rows: T[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();
  if (!normalizedKeyword) return rows;

  return rows.filter((row) =>
    PURCHASE_PRODUCT_LINE_COLUMNS.some((column) =>
      String(row[column.key] ?? "").toLowerCase().includes(normalizedKeyword),
    ),
  );
}

export function formatPurchaseProductLineForExport(row: PurchaseProductLine) {
  return Object.fromEntries(
    PURCHASE_PRODUCT_LINE_COLUMNS.map((column) => [column.label, row[column.key] ?? ""]),
  );
}

function isConfirmedStatus(status: unknown) {
  const value = String(status ?? "");
  return value === "已确认" || value.includes("确认") || value.includes("纭") || value.includes("茬");
}

function getTime(value: unknown) {
  if (!value) return 0;
  const time = new Date(String(value)).getTime();
  return Number.isNaN(time) ? 0 : time;
}
