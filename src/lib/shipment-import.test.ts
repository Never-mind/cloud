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

  it("treats an unresolved address or recipient as display text instead of an id", () => {
    const row = mergeShipmentImportRow({
      imported: {
        shipmentId: "SHP-PO-900-001",
        poNo: "PO-900",
        // 历史订单：这些物流不在远端系统，文件里直接写地址和收件人文本
        destinationLocationId: "Rua A, 100, São Paulo",
        recipientContactId: "João",
      },
      existing: {
        shipmentId: "SHP-PO-900-001",
        poNo: "PO-900",
        destinationLocationId: "",
        recipientContactId: "",
        // 本地先生成的物流行带占位值，导入的文本必须能盖住它
        snapshotDestinationAddress: "待补充",
        snapshotRecipientName: "待补充",
        remoteLogisticsSourceStatus: "pending",
      },
      location: null,
      contact: null,
    });

    expect(row).toMatchObject({
      destinationLocationId: "",
      recipientContactId: "",
      snapshotDestinationAddress: "Rua A, 100, São Paulo",
      snapshotRecipientName: "João",
      remoteLogisticsSourceStatus: "pending",
    });
  });

  it("keeps the existing address id when a text address is imported over it", () => {
    const row = mergeShipmentImportRow({
      imported: { shipmentId: "SHP-1", destinationLocationId: "Rua B, 200" },
      existing: { shipmentId: "SHP-1", destinationLocationId: "BR-SP-WH1", snapshotDestinationAddress: "Av. Paulista 1000" },
      location: null,
      contact: null,
    });

    expect(row).toMatchObject({
      destinationLocationId: "BR-SP-WH1",
      snapshotDestinationAddress: "Rua B, 200",
    });
  });
});
