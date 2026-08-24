import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { upsertEntityRow } from "@/lib/crud";
import { queryRows, type Row } from "@/lib/db";
import { importRowsWithReport, isEntityTemplateNoteRow, normalizeEntityImportRow } from "@/lib/entity-import";
import { getEntityConfig } from "@/lib/modules";
import { isBlankImportValue, mergeShipmentImportRow, normalizeText } from "@/lib/shipment-import";
import { resolveDemandPlanImportRow } from "@/lib/purchase-order-demand-plan";
import { autofillInstanceContractImportRow } from "@/lib/instance-contract-import";

export async function POST(request: NextRequest, context: { params: Promise<{ entity: string }> }) {
  const { entity } = await context.params;
  const config = getEntityConfig(entity);

  if (!config) {
    return NextResponse.json({ error: "Unknown entity" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const fixedValues = getDemandPlanFixedValues(config.key, formData.get("fixedValues"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(worksheet, { defval: "", raw: false })
    .filter((row) => !isEntityTemplateNoteRow(config, row));
  const fieldByLabel = new Map(config.formFields.map((field) => [field.label, field.key]));
  // Historical datacenter templates called this field "物理地址ID", while actual imports
  // contain the full physical address. Keep those files importable after the label change.
  if (config.key === "datacenters") fieldByLabel.set("物理地址ID", "locationId");
  const mappedRows = rows.map((row) => ({
    ...Object.fromEntries(
      Object.entries(row)
        .map(([label, value]) => [fieldByLabel.get(label) ?? label, value])
        .filter(([field]) => config.formFields.some((item) => item.key === field)),
    ),
    ...fixedValues,
  }));

  const normalizedRows = mappedRows.map((row) => {
    const normalized = normalizeEntityImportRow(config, row);
    if (config.key === "shipments") {
      for (const field of config.formFields) {
        if (field.type === "boolean" && isBlankImportValue(row[field.key])) {
          normalized[field.key] = null;
        }
      }
    }
    return normalized;
  });
  if (config.key === "shipments") {
    await enrichShipmentImportRows(normalizedRows);
  }
  if (config.key === "instance-contracts") {
    await enrichInstanceContractImportRows(normalizedRows);
  }
  if (config.key === "purchase-order-sn-items" || config.key === "purchase-order-plan-items") {
    await enrichDemandPlanImportRows(normalizedRows);
  }
  const report = await importRowsWithReport(config, normalizedRows, async (row) => {
    if ((config.key === "purchase-order-sn-items" || config.key === "purchase-order-plan-items") && !normalizeText(row.purchaseOrderId)) {
      throw new Error("未找到对应的PO订单号，请检查PO订单号是否存在");
    }
    await upsertEntityRow(config, row);
  });
  return NextResponse.json(report);
}

function getDemandPlanFixedValues(entityKey: string, value: FormDataEntryValue | null): Row {
  if (entityKey !== "purchase-order-sn-items" && entityKey !== "purchase-order-plan-items") return {};
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Row;
    return {
      purchaseOrderId: normalizeText(parsed.purchaseOrderId),
      poNo: normalizeText(parsed.poNo),
    };
  } catch {
    return {};
  }
}

async function enrichInstanceContractImportRows(rows: Row[]) {
  const deviceCodes = Array.from(new Set(rows.map((row) => normalizeText(row.deviceCode)).filter(Boolean)));
  const instanceModels = deviceCodes.length
    ? await queryRows<Row>(
        "SELECT deviceCode, modelCode, nameEn FROM instancemodels WHERE deviceCode IN (:deviceCodes)",
        { deviceCodes },
      )
    : [];

  for (const [index, row] of rows.entries()) {
    rows[index] = autofillInstanceContractImportRow(row, instanceModels);
  }
}

async function enrichDemandPlanImportRows(rows: Row[]) {
  const poNos = Array.from(
    new Set(rows.map((row) => normalizeText(row.poNo ?? row.purchaseOrderNo)).filter(Boolean)),
  );
  const requestNos = Array.from(new Set(rows.map((row) => normalizeText(row.requestNo)).filter(Boolean)));
  const requestMatchedItems = requestNos.length
    ? await queryRows<{ id: string; purchaseOrderId: string; requestNo: string | null }>(
        "SELECT id, purchaseOrderId, requestNo FROM purchaseorderitems WHERE requestNo IN (:requestNos)",
        { requestNos },
      )
    : [];
  const purchaseOrderIdsFromRequest = Array.from(new Set(requestMatchedItems.map((row) => row.purchaseOrderId)));
  const purchaseOrders = poNos.length || purchaseOrderIdsFromRequest.length
    ? await queryRows<{ purchaseOrderId: string; poNo: string }>(
        "SELECT purchaseOrderId, poNo FROM purchaseorders WHERE poNo IN (:poNos) OR purchaseOrderId IN (:purchaseOrderIds)",
        {
          poNos: poNos.length ? poNos : ["__none__"],
          purchaseOrderIds: purchaseOrderIdsFromRequest.length ? purchaseOrderIdsFromRequest : ["__none__"],
        },
      )
    : [];
  const purchaseOrderIds = purchaseOrders.map((row) => row.purchaseOrderId);
  const purchaseOrderItems = purchaseOrderIds.length
    ? await queryRows<{ id: string; purchaseOrderId: string; requestNo: string | null }>(
        "SELECT id, purchaseOrderId, requestNo FROM purchaseorderitems WHERE purchaseOrderId IN (:purchaseOrderIds)",
        { purchaseOrderIds },
      )
    : requestMatchedItems;

  for (const [index, row] of rows.entries()) {
    rows[index] = resolveDemandPlanImportRow(row, purchaseOrders, purchaseOrderItems) as Row;
  }
}

async function enrichShipmentImportRows(rows: Row[]) {
  const shipmentIds = Array.from(new Set(rows.map((row) => normalizeText(row.shipmentId)).filter(Boolean)));
  const locationIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.destinationLocationId)).filter(Boolean)),
  );
  const contactIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.recipientContactId)).filter(Boolean)),
  );
  const dcCodes = Array.from(
    new Set(rows.map((row) => normalizeText(row.dcCode)).filter(Boolean)),
  );
  const poNos = Array.from(
    new Set(rows.map((row) => normalizeText(row.poNo)).filter(Boolean)),
  );
  const purchaseOrderItemIds = Array.from(
    new Set(rows.map((row) => normalizeText(row.purchaseOrderItemId)).filter(Boolean)),
  );

  const existingRows = shipmentIds.length
    ? await queryRows<Row>("SELECT * FROM shipments WHERE shipmentId IN (:shipmentIds)", { shipmentIds })
    : [];
  const locations = locationIds.length
    ? await queryRows<{ locationId: string; fullAddress: string }>(
        "SELECT locationId, fullAddress FROM deliverylocations WHERE locationId IN (:locationIds)",
        { locationIds },
      )
    : [];
  const contacts = locationIds.length || contactIds.length
    ? await queryRows<{ contactId: string; locationId: string; name: string; phone: string }>(
        `
          SELECT contactId, locationId, name, phone
          FROM deliverycontacts
          WHERE locationId IN (:locationIds) OR contactId IN (:contactIds)
        `,
        {
          locationIds: locationIds.length ? locationIds : ["__none__"],
          contactIds: contactIds.length ? contactIds : ["__none__"],
        },
      )
    : [];
  const datacenters = dcCodes.length
    ? await queryRows<{ dcCode: string; nameZh: string }>(
        "SELECT dcCode, nameZh FROM datacenters WHERE dcCode IN (:dcCodes)",
        { dcCodes },
      )
    : [];
  const purchaseLines = poNos.length || purchaseOrderItemIds.length
    ? await queryRows<{
        poNo: string;
        purchaseOrderItemId: string;
        batchName: string | null;
        deviceCode: string | null;
        nameEn: string | null;
      }>(
        `
          SELECT
            poi.poNo,
            poi.id AS purchaseOrderItemId,
            req.batchName,
            ri.deviceCode,
            im.nameEn
          FROM purchaseorderitems poi
          LEFT JOIN requestitems ri ON ri.id = poi.requestItemId
          LEFT JOIN requests req ON req.requestNo = ri.requestNo
          LEFT JOIN instancemodels im ON im.deviceCode = ri.deviceCode
          WHERE poi.poNo IN (:poNos) OR poi.id IN (:purchaseOrderItemIds)
        `,
        {
          poNos: poNos.length ? poNos : ["__none__"],
          purchaseOrderItemIds: purchaseOrderItemIds.length ? purchaseOrderItemIds : ["__none__"],
        },
      )
    : [];

  const existingById = new Map(existingRows.map((row) => [String(row.shipmentId), row]));
  const locationById = new Map(locations.map((location) => [String(location.locationId), location]));
  const contactById = new Map(contacts.map((contact) => [String(contact.contactId), contact]));
  const datacenterByCode = new Map(datacenters.map((datacenter) => [String(datacenter.dcCode), datacenter]));
  const purchaseLineById = new Map(purchaseLines.map((line) => [String(line.purchaseOrderItemId), line]));
  const purchaseLinesByPoNo = new Map<string, typeof purchaseLines>();
  for (const line of purchaseLines) {
    const key = String(line.poNo);
    purchaseLinesByPoNo.set(key, [...(purchaseLinesByPoNo.get(key) ?? []), line]);
  }
  const contactsByLocation = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    const key = String(contact.locationId);
    contactsByLocation.set(key, [...(contactsByLocation.get(key) ?? []), contact]);
  }

  for (const [index, row] of rows.entries()) {
    const locationId = normalizeText(row.destinationLocationId);
    const location = locationById.get(locationId);

    let contact = row.recipientContactId ? contactById.get(normalizeText(row.recipientContactId)) : undefined;
    if (!contact) {
      const locationContacts = contactsByLocation.get(locationId) ?? [];
      if (locationContacts.length === 1) {
        contact = locationContacts[0];
      }
    }

    const purchaseOrderItemId = normalizeText(row.purchaseOrderItemId);
    const poLines = purchaseLinesByPoNo.get(normalizeText(row.poNo)) ?? [];
    const purchaseLine =
      purchaseLineById.get(purchaseOrderItemId) ??
      poLines.find((line) => normalizeText(line.deviceCode) === normalizeText(row.deviceCode)) ??
      (poLines.length === 1 ? poLines[0] : undefined);

    rows[index] = mergeShipmentImportRow({
      imported: row,
      existing: existingById.get(normalizeText(row.shipmentId)),
      location,
      contact,
      datacenter: datacenterByCode.get(normalizeText(row.dcCode)),
      purchaseLine,
    });
  }
}
