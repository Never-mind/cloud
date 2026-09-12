import { describe, expect, it } from "vitest";
import { pendingShipmentRemoteLogisticsFields, shipmentRemoteLogisticsFields } from "./procurement-service";

describe("remote shipment logistics snapshots", () => {
  it("stores remote identifiers for traceability but keeps display values readable", () => {
    const fields = shipmentRemoteLogisticsFields({
      remoteDemandOrderId: "DO-00028",
      remoteDatacenterId: "DC-006",
      remoteDeliveryLocationId: "DL-018",
      remoteRecipientListId: "DRL-032",
      datacenterName: "São Paulo DC",
      destinationAddress: "Rua A, 100, São Paulo, Brazil",
      recipientName: "Maria Silva",
      recipientPhone: "+55 11 99999-8888",
      remoteModifiedAt: "2026-09-10 15:30:00",
      snapshotJson: "{\"source\":\"frappe\"}",
      snapshotAt: "2026-09-10T15:31:00.000Z",
    });

    expect(fields).toMatchObject({
      remoteDatacenterId: "DC-006",
      remoteDeliveryLocationId: "DL-018",
      remoteRecipientListId: "DRL-032",
      dcNameZh: "São Paulo DC",
      snapshotDestinationAddress: "Rua A, 100, São Paulo, Brazil",
      snapshotRecipientName: "Maria Silva",
      snapshotRecipientPhone: "+55 11 99999-8888",
      remoteLogisticsSourceStatus: "remote",
    });
  });

  it("marks shipments as pending when the remote lookup is unavailable", () => {
    const fields = pendingShipmentRemoteLogisticsFields();

    expect(fields).toMatchObject({
      remoteLogisticsSourceStatus: "pending",
      remoteDatacenterId: null,
      remoteDeliveryLocationId: null,
      remoteRecipientListId: null,
      remoteDemandOrderId: null,
      logisticsSnapshotJson: null,
    });
    // 不能把远端列写成 undefined：插入语句会带这些参数。
    expect(Object.values(fields).every((value) => value === null || value === "pending")).toBe(true);
  });
});
