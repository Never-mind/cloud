import { describe, expect, it } from "vitest";
import { getEntityConfig, navGroups } from "./modules";
import { purchaseOrderPlanFieldSpecs, purchaseOrderSnFieldSpecs } from "./purchase-order-demand-plan-fields";

describe("module configuration", () => {
  it("registers instance contracts under contract management", () => {
    const config = getEntityConfig("instance-contracts");

    expect(config).toBeDefined();
    expect(config?.route).toBe("/contracts/instance-contracts");
    expect(config?.primaryKey).toBe("id");
    expect(config?.uniqueKeys).toEqual(["contractNo", "countryCode", "deviceCode"]);
    expect(config?.listFields[0]).toMatchObject({ key: "id", defaultVisible: false });
    expect(config?.formFields.map((field) => field.key)).toEqual([
      "contractNo",
      "countryCode",
      "deviceCode",
      "modelCode",
      "instanceModelEn",
      "currency",
      "first24MonthPriceUSD",
      "next36MonthPriceUSD",
    ]);
    expect(config?.formFields.find((field) => field.key === "first24MonthPriceUSD")?.label).toBe(
      "前24个月含税单价",
    );
    expect(config?.formFields.find((field) => field.key === "next36MonthPriceUSD")?.label).toBe(
      "后36个月含税单价",
    );

    const contractGroup = navGroups.find((group) =>
      group.items.some((item) => item.key === "instance-contracts"),
    );
    expect(contractGroup?.title).toBe("合同管理");
  });

  it("places billing adjustments under contract management", () => {
    const contractGroup = navGroups.find((group) => group.title === "合同管理");

    expect(contractGroup?.items.map((item) => item.key)).toContain("billing-adjustments");
  });

  it("configures billing adjustments as master records", () => {
    const config = getEntityConfig("billing-adjustments");
    const listKeys = config?.listFields.map((field) => field.key);
    const formKeys = config?.formFields.map((field) => field.key);

    expect(listKeys).toContain("instanceContractNo");
    expect(listKeys).toContain("itemCount");
    expect(formKeys).toContain("instanceContractNo");
    expect(formKeys).not.toContain("currency");
  });

  it("places finance management directly under home in sidebar order", () => {
    expect(navGroups[0]?.title).toBe("财务管理");
  });

  it("groups finance modules by workflow without adding finance summary", () => {
    const financeGroup = navGroups[0];

    expect(financeGroup?.children?.map((child) => child.title)).toEqual([
      "月账单管理",
      "预付款管理",
      "服务费核算",
    ]);
    expect(financeGroup?.children?.flatMap((child) => child.items.map((item) => item.key))).toEqual([
      "billing-available",
      "billing-ledgers",
      "monthly-billing-writeoffs",
      "billing-statements",
      "prepayment-available",
      "prepayment-contracts",
      "monthly-prepayment-writeoffs",
      "prepayment-writeoff-adjustments",
      "service-fees",
      "service-fee-snapshots",
      "service-fee-snapshot-items",
    ]);
    expect(financeGroup?.children?.map((child) => child.title)).not.toContain("财务汇总");
  });

  it("removes purchase order exchange rate from list and form configuration", () => {
    const config = getEntityConfig("purchase-orders");

    expect(config?.primaryKey).toBe("purchaseOrderId");
    expect(config?.listFields.map((field) => field.key)).toContain("poNo");
    expect(config?.listFields.map((field) => field.key)).toContain("requestNo");
    expect(config?.listFields.map((field) => field.key)).not.toContain("sourceRequestNos");
    expect(config?.listFields.map((field) => field.key)).not.toContain("usdRate");
    expect(config?.formFields.map((field) => field.key)).not.toContain("sourceRequestNos");
    expect(config?.formFields.map((field) => field.key)).not.toContain("usdRate");
  });

  it("configures purchase order currency as fixed options", () => {
    const config = getEntityConfig("purchase-orders");
    const currencyField = config?.formFields.find((field) => field.key === "currency");

    expect(currencyField?.type).toBe("select");
    expect(currencyField?.options?.map((option) => option.value)).toEqual(["CNY", "MXN", "CLP", "USD", "BRL"]);
  });

  it("labels service fee billing amount as monthly billing total", () => {
    for (const key of ["service-fees", "service-fee-snapshot-items"]) {
      const config = getEntityConfig(key);

      expect(config?.listFields.find((field) => field.key === "billingAmount")?.label).toBe("月账单总额（含税）");
      expect(config?.formFields.find((field) => field.key === "billingAmount")?.label).toBe("月账单总额（含税）");
    }
  });

  it("shows newest shipment rows first", () => {
    const config = getEntityConfig("shipments");

    expect(config?.defaultSort).toBe("createdAt DESC");
    expect(config?.listFields.map((field) => field.key)).toContain("batchName");
    expect(config?.formFields.map((field) => field.key)).toContain("batchName");
  });

  it("configures shipment display fields and a receipt status filter", () => {
    const config = getEntityConfig("shipments");

    expect(config?.listFields.map((field) => field.key)).toEqual(
      expect.arrayContaining(["dcNameZh", "destinationAddress", "recipientName"]),
    );
    expect(config?.listFields.map((field) => field.key)).not.toContain("destinationLocationId");
    expect(config?.listFields.map((field) => field.key)).not.toContain("recipientContactId");
    expect(config?.filters.find((field) => field.key === "receiptStatus")).toMatchObject({
      type: "select",
      options: [
        { label: "已签收", value: "received" },
        { label: "未签收", value: "unreceived" },
      ],
    });
  });

  it("keeps shipment reference fields available for searchable selection in the edit form", () => {
    const config = getEntityConfig("shipments");

    expect(config?.formFields.filter((field) => field.lookupSource)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "dcCode", lookupSource: "datacenters" }),
        expect.objectContaining({ key: "destinationLocationId", lookupSource: "delivery-locations" }),
        expect.objectContaining({ key: "recipientContactId", lookupSource: "delivery-contacts" }),
      ]),
    );
  });

  it("registers full purchase order demand plan child entities", () => {
    const snConfig = getEntityConfig("purchase-order-sn-items");
    const planConfig = getEntityConfig("purchase-order-plan-items");

    expect(snConfig?.table).toBe("purchaseordersnitems");
    expect(snConfig?.primaryKey).toBe("id");
    expect(snConfig?.showSequence).toBe(true);
    expect(planConfig?.showSequence).toBe(true);
    expect(snConfig?.listFields).toEqual(purchaseOrderSnFieldSpecs);
    expect(planConfig?.listFields).toEqual(purchaseOrderPlanFieldSpecs);
    expect(snConfig?.formFields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "purchaseOrderId",
        "poNo",
        "purchaseOrderItemId",
        "sn",
        "fixedAssetCode",
        "materialDescription",
        "shippingBatch",
        "parentAssetNo",
        "componentCategory",
        "packingListNo",
        "parentCode",
        "finalParentCode",
        "level",
      ]),
    );
    expect(planConfig?.table).toBe("purchaseorderplanitems");
    expect(planConfig?.formFields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        "purchaseOrderId",
        "poNo",
        "purchaseOrderItemId",
        "sourcePlanId",
        "quoteReceivedAt",
        "poIssuedAt",
        "receiptProofUploadedAt",
        "logisticsReceivedAt",
        "ataAt",
        "ata",
        "supplierCpd",
        "material",
      ]),
    );
    expect(snConfig?.formFields.filter((field) => field.hidden).map((field) => field.key)).toEqual([
      "id",
      "purchaseOrderId",
      "purchaseOrderItemId",
      "requestNo",
    ]);
  });
});
