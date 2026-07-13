import { describe, expect, it } from "vitest";
import { mergeShipmentImportRow } from "./shipment-import";

describe("shipment import", () => {
  it("preserves existing values when imported cells are blank and enriches lookup snapshots", () => {
    const row = mergeShipmentImportRow({
      imported: {
        shipmentId: "SHP-PO-112-001",
        poNo: "PO-112",
        batchName: null,
        purchaseOrderItemId: "",
        deviceCode: "",
        nameEn: null,
        destinationLocationId: "BR-SP-WH1",
        recipientContactId: "CT-BR-MARIA",
        snapshotDestinationAddress: "",
        snapshotRecipientName: "",
        snapshotRecipientPhone: "",
        dcCode: "DC-BR-SP1",
        dcNameZh: "",
        transportMode: "海运",
        isReceived: false,
      },
      existing: {
        shipmentId: "SHP-PO-112-001",
        poNo: "PO-112",
        batchName: "BR-112",
        purchaseOrderItemId: "POI-112-1",
        deviceCode: "06114127",
        nameEn: "Cloud Host X",
        isReceived: true,
      },
      location: {
        locationId: "BR-SP-WH1",
        fullAddress: "Av. Paulista 1000, Sao Paulo, Brazil.",
      },
      contact: {
        contactId: "CT-BR-MARIA",
        locationId: "BR-SP-WH1",
        name: "Maria Silva",
        phone: "00551188889999",
      },
      datacenter: {
        dcCode: "DC-BR-SP1",
        nameZh: "巴西圣保罗机房",
      },
    });

    expect(row).toMatchObject({
      shipmentId: "SHP-PO-112-001",
      poNo: "PO-112",
      batchName: "BR-112",
      purchaseOrderItemId: "POI-112-1",
      deviceCode: "06114127",
      nameEn: "Cloud Host X",
      destinationLocationId: "BR-SP-WH1",
      recipientContactId: "CT-BR-MARIA",
      snapshotDestinationAddress: "Av. Paulista 1000, Sao Paulo, Brazil.",
      snapshotRecipientName: "Maria Silva",
      snapshotRecipientPhone: "00551188889999",
      dcCode: "DC-BR-SP1",
      dcNameZh: "巴西圣保罗机房",
      transportMode: "海运",
      isReceived: false,
    });
  });
});
