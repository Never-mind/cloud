import { queryRows, type Row } from "./db";
import { DEFAULT_PAGE_SIZE, normalizePageSize } from "./pagination";

type ProductLineListResult = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type PageOptions = {
  exportAll: boolean;
  page: number;
  pageSize: number;
};

export async function listRequestProductLines(searchParams: URLSearchParams): Promise<ProductLineListResult> {
  const keyword = searchParams.get("keyword")?.trim();
  const options = getPageOptions(searchParams);
  const params: Row = {};
  const whereParts = ["req.status IN ('待下单', '已下单')"];

  if (keyword) {
    whereParts.push(`(
      req.countryCode LIKE :keyword OR req.batchName LIKE :keyword OR ri.requestNo LIKE :keyword
      OR ri.deviceCode LIKE :keyword OR model.modelCode LIKE :keyword OR model.nameEn LIKE :keyword
      OR supplier.name LIKE :keyword OR supplier.supplierCode LIKE :keyword
    )`);
    params.keyword = `%${keyword}%`;
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const [{ total }] = await queryRows<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM requestitems AS ri
      INNER JOIN requests AS req ON req.requestNo = ri.requestNo
      LEFT JOIN instancemodels AS model ON model.deviceCode = ri.deviceCode
      LEFT JOIN suppliers AS supplier ON supplier.supplierId = ri.supplierId
      ${where}
    `,
    params,
  );

  const normalizedTotal = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / options.pageSize));
  const page = options.exportAll ? 1 : Math.min(options.page, totalPages);
  if (!options.exportAll) {
    params.limit = options.pageSize;
    params.offset = (page - 1) * options.pageSize;
  }

  const rows = await queryRows<Row>(
    `
      SELECT
        ri.id,
        req.countryCode,
        req.batchName,
        ri.requestNo,
        ri.deviceCode,
        model.modelCode,
        model.nameEn,
        COALESCE(supplier.name, supplier.supplierCode, ri.supplierId) AS supplierName,
        ri.quantity,
        DATE_FORMAT(req.plannedDeliveryDate, '%Y-%m-%d') AS plannedDeliveryDate,
        DATE_FORMAT(req.createdAt, '%Y-%m-%d') AS createdAt,
        DATE_FORMAT(req.updatedAt, '%Y-%m-%d') AS updatedAt
      FROM requestitems AS ri
      INNER JOIN requests AS req ON req.requestNo = ri.requestNo
      LEFT JOIN instancemodels AS model ON model.deviceCode = ri.deviceCode
      LEFT JOIN suppliers AS supplier ON supplier.supplierId = ri.supplierId
      ${where}
      ORDER BY req.updatedAt DESC, req.createdAt DESC, ri.id
      ${options.exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  return { rows, total: normalizedTotal, page, pageSize: options.pageSize, totalPages };
}

export async function listPurchaseProductLines(searchParams: URLSearchParams): Promise<ProductLineListResult> {
  const keyword = searchParams.get("keyword")?.trim();
  const options = getPageOptions(searchParams);
  const params: Row = {};
  const whereParts = ["purchase.status LIKE '%确认%'"];

  if (keyword) {
    whereParts.push(`(
      purchase.poNo LIKE :keyword OR purchase.requestNo LIKE :keyword OR purchase.sourceRequestNos LIKE :keyword
      OR requestItem.requestNo LIKE :keyword OR requestItem.deviceCode LIKE :keyword
      OR model.nameZh LIKE :keyword OR model.nameEn LIKE :keyword OR requestMaster.batchName LIKE :keyword
    )`);
    params.keyword = `%${keyword}%`;
  }

  const where = `WHERE ${whereParts.join(" AND ")}`;
  const [{ total }] = await queryRows<{ total: number }>(
    `
      SELECT COUNT(*) AS total
      FROM purchaseorderitems AS item
      INNER JOIN purchaseorders AS purchase
        ON purchase.poNo = item.poNo
      LEFT JOIN requestitems AS requestItem ON requestItem.id = item.requestItemId
      LEFT JOIN requests AS requestMaster
        ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo)
      LEFT JOIN instancemodels AS model ON model.deviceCode = requestItem.deviceCode
      ${where}
    `,
    params,
  );

  const normalizedTotal = Number(total ?? 0);
  const totalPages = Math.max(1, Math.ceil(normalizedTotal / options.pageSize));
  const page = options.exportAll ? 1 : Math.min(options.page, totalPages);
  if (!options.exportAll) {
    params.limit = options.pageSize;
    params.offset = (page - 1) * options.pageSize;
  }

  const rows = await queryRows<Row>(
    `
      SELECT
        item.id,
        purchase.poNo,
        COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo, purchase.requestNo, '') AS requestNo,
        requestMaster.batchName,
        purchase.status,
        requestItem.deviceCode,
        model.nameZh,
        model.nameEn,
        requestItem.quantity,
        purchase.currency,
        COALESCE(item.taxExcludedUnitPrice, item.unitPrice, 0) AS taxExcludedUnitPrice,
        COALESCE(item.taxSurcharge, 0) AS taxSurcharge,
        COALESCE(item.unitPrice, COALESCE(item.taxExcludedUnitPrice, 0) + COALESCE(item.taxSurcharge, 0)) AS unitPrice,
        ROUND(
          COALESCE(requestItem.quantity, 0) * COALESCE(item.unitPrice, COALESCE(item.taxExcludedUnitPrice, 0) + COALESCE(item.taxSurcharge, 0)),
          4
        ) AS totalAmount
      FROM purchaseorderitems AS item
      INNER JOIN purchaseorders AS purchase
        ON purchase.poNo = item.poNo
      LEFT JOIN requestitems AS requestItem ON requestItem.id = item.requestItemId
      LEFT JOIN requests AS requestMaster
        ON requestMaster.requestNo = COALESCE(NULLIF(item.requestNo, ''), requestItem.requestNo)
      LEFT JOIN instancemodels AS model ON model.deviceCode = requestItem.deviceCode
      ${where}
      ORDER BY purchase.createdAt DESC, item.id
      ${options.exportAll ? "" : "LIMIT :limit OFFSET :offset"}
    `,
    params,
  );

  return { rows, total: normalizedTotal, page, pageSize: options.pageSize, totalPages };
}

function getPageOptions(searchParams: URLSearchParams): PageOptions {
  const exportAll = searchParams.get("export") === "1";
  const requestedPage = Math.max(1, Math.floor(Number(searchParams.get("page") ?? 1) || 1));
  const pageSize = normalizePageSize(Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE));
  return { exportAll, page: requestedPage, pageSize };
}
