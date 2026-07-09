import { describe, expect, it } from "vitest";
import { getEntityConfig, navGroups } from "./modules";

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

    expect(config?.listFields.map((field) => field.key)).not.toContain("usdRate");
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

      expect(config?.listFields.find((field) => field.key === "billingAmount")?.label).toBe("月账单核销总额");
      expect(config?.formFields.find((field) => field.key === "billingAmount")?.label).toBe("月账单核销总额");
    }
  });

  it("shows newest shipment rows first", () => {
    const config = getEntityConfig("shipments");

    expect(config?.defaultSort).toBe("createdAt DESC");
  });
});
