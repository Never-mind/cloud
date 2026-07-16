import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderDetailHref,
  getDemandPlanImportColumns,
  resolveDemandPlanImportRow,
} from "./purchase-order-demand-plan";

describe("purchase order demand plan", () => {
  it("uses the system purchase ID for the purchase order detail link", () => {
    expect(buildPurchaseOrderDetailHref("SYS PO/001")).toBe("/purchase/orders/SYS%20PO%2F001");
  });

  it("provides all reviewed SN and plan import fields", () => {
    expect(getDemandPlanImportColumns("sn").map((column) => column.key)).toEqual([
      "poNo",
      "purchaseOrderItemId",
      "requestNo",
      "shippingBatch",
      "deviceVendor",
      "finalParentSn",
      "finalParentPn",
      "finalParentPnDescription",
      "supplierFinalParentCode",
      "finalParentCode",
      "level",
      "supplierParentCode",
      "supplierParentSn",
      "parentCode",
      "componentCategory",
      "sn",
      "fixedAssetCode",
      "materialDescription",
      "parentAssetNo",
      "packingListNo",
      "supplierChildComponentCode",
      "customerChildComponentCode",
      "supplierChildComponentDescription",
      "childComponentOriginalPn",
      "childComponentOriginalSn",
      "rackUnit",
      "site",
      "contactPhone",
    ]);
    expect(getDemandPlanImportColumns("plan").map((column) => column.key)).toContain("supplierCpd");
  });

  it("resolves imported plan rows from PO number and request number", () => {
    expect(
      resolveDemandPlanImportRow(
        { poNo: "PO-001", requestNo: "REQ-001", sn: "SN-01" },
        [{ purchaseOrderId: "SYS-001", poNo: "PO-001" }],
        [{ id: "POI-001", purchaseOrderId: "SYS-001", requestNo: "REQ-001" }],
      ),
    ).toMatchObject({ purchaseOrderId: "SYS-001", purchaseOrderItemId: "POI-001" });
  });

  it("resolves SN shipment rows from the requirement number when PO number is absent", () => {
    expect(
      resolveDemandPlanImportRow(
        { requestNo: "eSHWC26042482py", sn: "KS010010095C22732" },
        [{ purchaseOrderId: "SYS-001", poNo: "PO-001" }],
        [{ id: "POI-001", purchaseOrderId: "SYS-001", requestNo: "eSHWC26042482py" }],
      ),
    ).toMatchObject({ purchaseOrderId: "SYS-001", purchaseOrderItemId: "POI-001", poNo: "PO-001" });
  });

  it("uses the source purchase order number field from the demand plan child sheet", () => {
    expect(
      resolveDemandPlanImportRow(
        { purchaseOrderNo: "PO-001", sourcePlanId: "PLAN-001" },
        [{ purchaseOrderId: "SYS-001", poNo: "PO-001" }],
        [],
      ),
    ).toMatchObject({ purchaseOrderId: "SYS-001", poNo: "PO-001" });
  });
});
