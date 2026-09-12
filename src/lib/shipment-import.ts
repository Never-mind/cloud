import type { Row } from "./db";

type ShipmentLocationLookup = {
  locationId: string;
  fullAddress?: string | null;
};

type ShipmentContactLookup = {
  contactId: string;
  locationId?: string | null;
  name?: string | null;
  phone?: string | null;
};

type ShipmentDatacenterLookup = {
  dcCode: string;
  nameZh?: string | null;
};

type ShipmentPurchaseLineLookup = {
  poNo?: string | null;
  purchaseOrderItemId?: string | null;
  batchName?: string | null;
  deviceCode?: string | null;
  nameEn?: string | null;
};

type MergeShipmentImportRowInput = {
  imported: Row;
  existing?: Row | null;
  location?: ShipmentLocationLookup | null;
  contact?: ShipmentContactLookup | null;
  datacenter?: ShipmentDatacenterLookup | null;
  purchaseLine?: ShipmentPurchaseLineLookup | null;
};

export function mergeShipmentImportRow({
  imported,
  existing,
  location,
  contact,
  datacenter,
  purchaseLine,
}: MergeShipmentImportRowInput): Row {
  const merged: Row = { ...(existing ?? {}) };

  for (const [key, value] of Object.entries(imported)) {
    if (!isBlankImportValue(value)) {
      merged[key] = value;
    }
  }

  applyFallback(merged, "batchName", purchaseLine?.batchName);
  applyFallback(merged, "purchaseOrderItemId", purchaseLine?.purchaseOrderItemId);
  applyFallback(merged, "deviceCode", purchaseLine?.deviceCode);
  applyFallback(merged, "nameEn", purchaseLine?.nameEn);

  const importedLocationId = normalizeText(imported.destinationLocationId);
  if (importedLocationId && !location) {
    // 文件里填的是地址文本、匹配不到交付地址档案：按展示地址写入快照，
    // 否则这段文本会停在地址ID列里，被"待补充"之类的快照值盖住看不见。
    merged.destinationLocationId = normalizeText(existing?.destinationLocationId);
    merged.snapshotDestinationAddress = importedLocationId;
  } else if (importedLocationId && location?.fullAddress && isBlankImportValue(imported.snapshotDestinationAddress)) {
    merged.snapshotDestinationAddress = location.fullAddress;
  } else {
    applyFallback(merged, "snapshotDestinationAddress", location?.fullAddress);
  }

  const importedContactId = normalizeText(imported.recipientContactId);
  if (importedContactId && !contact) {
    // 同上：填的是收件人姓名文本时写入姓名快照，不要让文本占着收件人ID。
    merged.recipientContactId = normalizeText(existing?.recipientContactId);
    merged.snapshotRecipientName = importedContactId;
  } else if (importedContactId && contact) {
    if (contact.name && isBlankImportValue(imported.snapshotRecipientName)) {
      merged.snapshotRecipientName = contact.name;
    }
    if (contact.phone && isBlankImportValue(imported.snapshotRecipientPhone)) {
      merged.snapshotRecipientPhone = contact.phone;
    }
  } else if (contact) {
    applyFallback(merged, "recipientContactId", contact.contactId);
    applyFallback(merged, "snapshotRecipientName", contact.name);
    applyFallback(merged, "snapshotRecipientPhone", contact.phone);
  }

  const importedDcCode = normalizeText(imported.dcCode);
  if (importedDcCode && !datacenter) {
    // 填的是机房名称文本、匹配不到机房档案时，按展示名称写入，保留原机房编码。
    merged.dcCode = normalizeText(existing?.dcCode);
    merged.dcNameZh = importedDcCode;
  } else if (importedDcCode && datacenter) {
    merged.dcCode = datacenter.dcCode;
    if (datacenter.nameZh && isBlankImportValue(imported.dcNameZh)) {
      merged.dcNameZh = datacenter.nameZh;
    }
  } else {
    applyFallback(merged, "dcNameZh", datacenter?.nameZh);
  }

  return merged;
}

export function isBlankImportValue(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function applyFallback(row: Row, key: string, value: unknown) {
  if (isBlankImportValue(row[key]) && !isBlankImportValue(value)) {
    row[key] = value;
  }
}
