import { describe, expect, it } from "vitest";
import { getEntityConfig, navGroups } from "./modules";
import { getEntityOrderBy } from "./crud";
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

    const powerGroup = navGroups.find((group) => group.title === "算力系统");
    const contractGroup = powerGroup?.children?.find((child) => child.title === "合同管理");
    expect(contractGroup?.title).toBe("合同管理");
    expect(contractGroup?.items.map((item) => item.key)).toContain("instance-contracts");
  });

  it("places billing adjustments under contract management", () => {
    const contractGroup = navGroups.find((group) => group.title === "算力系统")?.children?.find((child) => child.title === "合同管理");

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

  it("exposes business partners and user management as independent top-level directories", () => {
    expect(navGroups.map((group) => group.title)).toEqual([
      "算力系统",
      "集采系统",
      "华为云业务",
      "业务伙伴",
      "用户管理",
    ]);
  });

  it("keeps shared parties and their related records under business partners", () => {
    const businessPartnerGroup = navGroups.find((group) => group.title === "业务伙伴");

    expect(businessPartnerGroup?.children).toBeUndefined();
    expect(businessPartnerGroup?.items.map((item) => item.title)).toEqual([
      "供应商管理",
      "客户管理",
      "承接单位管理",
    ]);
    expect(businessPartnerGroup?.items.map((item) => item.key)).toEqual([
      "suppliers",
      "customers",
      "undertaking-units",
    ]);
    expect(["suppliers", "customers", "undertaking-units"].map((key) => getEntityConfig(key)?.navGroup)).toEqual([
      "业务伙伴",
      "业务伙伴",
      "业务伙伴",
    ]);
  });

  it("sorts business partners by their codes by default", () => {
    expect(getEntityOrderBy(getEntityConfig("suppliers")!)).toBe("ORDER BY supplierCode ASC");
    expect(getEntityOrderBy(getEntityConfig("customers")!)).toBe("ORDER BY customerCode ASC");
    expect(getEntityOrderBy(getEntityConfig("undertaking-units")!)).toBe("ORDER BY entityCode ASC");
  });

  it("uses one Chinese full-name field for undertaking units", () => {
    const config = getEntityConfig("undertaking-units");

    expect(config?.listFields).toContainEqual({ key: "entityName", label: "承接单位全称（中文）" });
    expect(config?.listFields.map((field) => field.key)).not.toContain("nameCn");
    expect(config?.formFields.filter((field) => field.key === "entityName")).toHaveLength(1);
    expect(config?.formFields.map((field) => field.key)).not.toContain("nameCn");
  });

  it("exposes the product master workflow and quotation pages in the PO menu", () => {
    const productGroup = navGroups.find((group) => group.title === "集采系统");

    expect(productGroup?.children?.map((child) => child.title)).toEqual(["客户PO", "项目结算", "采购管理"]);
    expect(productGroup?.children?.flatMap((child) => child.items.map((item) => item.key))).toEqual([
      "customer-pos",
      "quotations",
      "history-quotations",
      "settlement-projects",
      "product-masters",
      "product-models",
      "product-specifications",
      "customer-product-aliases",
      "tariff-rates",
    ]);
  });

  it("exposes the Huawei Cloud reconciliation module in its own top-level menu", () => {
    const cloudGroup = navGroups.find((group) => group.title === "华为云业务");
    expect(cloudGroup?.children?.map((child) => child.title)).toEqual(["华为云对账"]);
    expect(cloudGroup?.children?.flatMap((child) => child.items.map((item) => item.key))).toEqual(["huawei-cloud"]);
  });

  it("groups finance modules by workflow without adding finance summary", () => {
    const financeGroup = navGroups.find((group) => group.title === "算力系统")?.children?.find((child) => child.title === "财务管理");

    expect(financeGroup?.children?.map((child) => child.title)).toEqual([
      "成本与锚定价格",
      "月账单管理",
      "预付款管理",
      "服务费核算",
    ]);
    expect(financeGroup?.children?.flatMap((child) => child.items.map((item) => item.key))).toEqual([
      "b6-type-configs",
      "capex-pricing",
      "balance-settlements",
      "non-instance-settlements",
      "balance-final-settlements",
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
      "internal-service-fee-available",
      "internal-service-fees",
      "internal-service-fee-adjustments",
      "internal-service-fee-snapshots",
    ]);
    expect(financeGroup?.children?.map((child) => child.title)).not.toContain("财务汇总");
  });

  it("uses separate modules for instance sources, non-instance expenses, and final settlement", () => {
    expect(getEntityConfig("balance-settlements")?.title).toBe("实例结差");
    expect(getEntityConfig("non-instance-settlements")?.title).toBe("非实例费用结差");
    expect(getEntityConfig("balance-final-settlements")?.title).toBe("结差结算单");
  });

  it("exposes B6 rule management and the instance model default B6 type", () => {
    const b6Config = getEntityConfig("b6-type-configs");
    const instanceModels = getEntityConfig("instance-models");

    expect(b6Config?.route).toBe("/finance/b6-type-configs");
    expect(b6Config?.formFields.map((field) => field.key)).toEqual(expect.arrayContaining([
      "b6Type", "defaultFundingMonths", "defaultSpareOccupancyMonths", "overseasSpareServiceAvailable", "defaultSpareRate",
    ]));
    expect(instanceModels?.formFields.find((field) => field.key === "b6Type")?.lookupSource).toBe("b6-type-configs");
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

  it("sorts shipment rows by their natural batch sequence before creation time", () => {
    const config = getEntityConfig("shipments");

    expect(getEntityOrderBy(config!)).toContain("CAST(SUBSTRING_INDEX(TRIM(shipment.`batchName`), '-', -1) AS UNSIGNED) DESC");
    expect(getEntityOrderBy(config!)).toContain("UPPER(SUBSTRING_INDEX(TRIM(shipment.`batchName`), '-', 1)) ASC");
    expect(config?.listFields.map((field) => field.key)).toContain("batchName");
    expect(config?.formFields.map((field) => field.key)).toContain("batchName");
  });

  it("sorts monthly billing ledger rows by their natural batch sequence", () => {
    const config = getEntityConfig("billing-ledgers");
    const orderBy = getEntityOrderBy(config!);

    expect(orderBy).toContain("billinginstanceledgers.`batchName`");
    expect(orderBy).toContain("AS UNSIGNED) DESC");
    expect(orderBy).toContain("billinginstanceledgers.`ledgerId` ASC");
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
    expect(config?.filters.find((field) => field.key === "countryCode")).toMatchObject({
      type: "select",
      lookupSource: "countries",
    });
    expect(config?.listFields.map((field) => field.key)).toContain("countryCode");
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
    expect(snConfig?.listFields).toEqual([
      ...purchaseOrderSnFieldSpecs,
      { key: "createdAt", label: "创建时间", type: "datetime" },
      { key: "updatedAt", label: "更新时间", type: "datetime" },
    ]);
    expect(planConfig?.listFields).toEqual([
      ...purchaseOrderPlanFieldSpecs,
      { key: "createdAt", label: "创建时间", type: "datetime" },
      { key: "updatedAt", label: "更新时间", type: "datetime" },
    ]);
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

  it("does not expose demand plan entities in the power system directories", () => {
    const powerGroup = navGroups.find((group) => group.title === "算力系统");
    const procurementGroup = powerGroup?.children?.find((child) => child.title === "采购管理");
    const basicInfoGroup = powerGroup?.children?.find((child) => child.title === "基础信息");
    const visibleKeys = [
      ...(procurementGroup?.items ?? []),
      ...(basicInfoGroup?.items ?? []),
    ].map((item) => item.key);

    expect(visibleKeys).not.toContain("purchase-order-sn-items");
    expect(visibleKeys).not.toContain("purchase-order-plan-items");
  });
});
