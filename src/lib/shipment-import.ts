import type { Row } from "./db";

export type ShipmentLocationLookup = {
  locationId: string;
  fullAddress?: string | null;
};

export type ShipmentContactLookup = {
  contactId: string;
  locationId?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type ShipmentDatacenterLookup = {
  dcCode: string;
  nameZh?: string | null;
};

export type ShipmentPurchaseLineLookup = {
  poNo?: string | null;
  purchaseOrderItemId?: string | null;
  batchName?: string | null;
  deviceCode?: string | null;
  nameEn?: string | null;
};

export type MergeShipmentImportRowInput = {
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
  if (importedLocationId && location?.fullAddress && isBlankImportValue(imported.snapshotDestinationAddress)) {
    merged.snapshotDestinationAddress = location.fullAddress;
  } else {
    applyFallback(merged, "snapshotDestinationAddress", location?.fullAddress);
  }

  const importedContactId = normalizeText(imported.recipientContactId);
  if (importedContactId && contact) {
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
  if (importedDcCode && datacenter?.nameZh && isBlankImportValue(imported.dcNameZh)) {
    merged.dcNameZh = datacenter.nameZh;
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
