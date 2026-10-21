import { describe, expect, it } from "vitest";
import {
  buildCostPaymentForm,
  cloudPaymentAttachmentOwnerIds,
  formatApprovalPaymentDate,
  resolveCostPaymentCompanyKey,
  resolveCostPaymentCustomerKey,
  validateCostPaymentEntries,
  type CostPaymentEntryInput,
} from "./cost-payment-approval-service";

const baseEntry: CostPaymentEntryInput = {
  ownerType: "purchase_order_payment",
  ownerId: "po-1",
  ownerNo: "PO-eSHWC26070111fm",
  period: "2026-07",
  undertakingUnitCode: "MXGS01",
  amount: 799474.81,
  currency: "USD",
  payee: "HUAWEI TECHNOLOGIES DE MEXICO",
  bankAccount: "00100003383",
  bankName: "ICBC Mexico",
  swiftCode: "ICBKCNBJMEX",
  feeKey: "none",
  paymentDate: "2026-11-15",
  invoiceIssued: false,
  orderNo: "PO-eSHWC26070111fm",
  batchNo: "MX-49",
};

describe("成本款付款申请", () => {
  it("供应商付款附件同时识别历史分组键和新列表行 id", () => {
    expect(cloudPaymentAttachmentOwnerIds({
      ownerId: "202609::supplier-1",
      attachmentOwnerId: "supplier-payment:202609:id:supplier-1",
      period: "202609",
      supplierId: "supplier-1",
    })).toEqual([
      "202609::supplier-1",
      "supplier-payment:202609:id:supplier-1",
      "supplier-payment:202609:supplier-1",
    ]);
  });

  it("承接单位按代码映射到审批公司选项（香港万众取 HK WANZHONG）", () => {
    expect(resolveCostPaymentCompanyKey("MXGS01")).toBe("mkm8pzj4-abuwjgwrngb-0");
    expect(resolveCostPaymentCompanyKey("HKGS01")).toBe("mkm8qka3-oo6hewsdtv-1");
    expect(resolveCostPaymentCompanyKey("mxgs02")).toBe("mkm8qka3-2t0q4vap5tm-5");
    // 阿根廷还没在飞书补选项
    expect(resolveCostPaymentCompanyKey("AGTS01")).toBe("");
  });

  it("客户名称映射：BANORTE / 枭龙云 / 万博", () => {
    expect(resolveCostPaymentCustomerKey("Afore banorte")).toBe("mkmc9br3-u2m28i1ldp-0");
    expect(resolveCostPaymentCustomerKey("枭龙云")).toBe("mkmc9br3-99aw3z0mn3-0");
    expect(resolveCostPaymentCustomerKey("万博")).toBe("mkmc9br3-ui70g8oievh-0");
    expect(resolveCostPaymentCustomerKey("LESPAGO")).toBe("");
  });

  it("算力分支：只带订单号/批次序号，不带客户名称", () => {
    const form = buildCostPaymentForm("compute", {
      reason: "支付算力采购订单货款",
      companyKey: "mkm8pzj4-abuwjgwrngb-0",
      entries: [{
        amount: 799474.81,
        currency: "USD",
        payee: "HUAWEI",
        bankAccount: "00100003383",
        bankName: "ICBC Mexico",
        swiftCode: "ICBKCNBJMEX",
        feeKey: "none",
        paymentDate: "2026-11-15",
        invoiceIssued: false,
        orderNo: "PO-eSHWC26070111fm",
        batchNo: "MX-49、MX-50",
        attachmentTokens: ["file-token-1"],
      }],
    });

    const ids = form.map((item) => item.id);
    expect(ids).toEqual([
      "widget16510492382000001",
      "widget17689025485230001",
      "widget17688921620770001",
      "widget17688932030050001",
      "widget17688927004010001",
    ]);
    expect(form[1].value).toBe("mkmewlrf-r482htyi7nc-0"); // 成本部门固定 CLOUD
    expect(form[3].value).toBe("mkm9capp-x50k57e3ab-0"); // 成本项目固定 算力

    const rows = form[4].value as Array<Array<{ id: string; value: unknown; currency?: string }>>;
    expect(rows).toHaveLength(1);
    const columns = Object.fromEntries(rows[0].map((item) => [item.id, item]));
    expect(columns.widget17688927361370001.value).toBe("PO-eSHWC26070111fm"); // 订单号
    expect(columns.widget17688927488200001.value).toBe("MX-49、MX-50"); // 批次序号
    expect(columns.widget17688927593880001.value).toBe(799474.81);
    expect(columns.widget17688927593880001.currency).toBe("USD");
    expect(columns.widget17688930544840001.value).toEqual(["file-token-1"]);
    // 飞书日期控件必须是 RFC3339，纯 YYYY-MM-DD 会被判为「控件值不合法或者为空」
    expect(columns.widget17688929678340001.value).toBe("2026-11-15T00:00:00+08:00");
    // 算力分支没有客户名称控件
    expect(rows[0].some((item) => item.id === "widget17688981032310001")).toBe(false);
  });

  it("华为云分支：第一列是客户名称；集采分支没有客户名称", () => {
    const entry = {
      amount: 100,
      currency: "MXN",
      payee: "HUAWEI",
      bankAccount: "1",
      bankName: "bank",
      swiftCode: "SWIFT",
      feeKey: "ours" as const,
      paymentDate: "2026-11-01",
      invoiceIssued: true,
      customerKey: "mkmc9br3-u2m28i1ldp-0",
      attachmentTokens: ["t1"],
    };
    const huaweiRows = buildCostPaymentForm("huawei", { reason: "r", companyKey: "c", entries: [entry] })[4].value as Array<Array<{ id: string; value: unknown }>>;
    expect(huaweiRows[0][0].id).toBe("widget17688981032310001");
    expect(huaweiRows[0][0].value).toBe("mkmc9br3-u2m28i1ldp-0");

    const otherRows = buildCostPaymentForm("other", {
      reason: "r",
      companyKey: "c",
      entries: [{ ...entry, customerKey: undefined }],
    })[4].value as Array<Array<{ id: string }>>;
    expect(otherRows[0].some((item) => item.id === "widget17688981032310001")).toBe(false);
  });

  it("需求付款日期按 RFC3339 补齐时区", () => {
    expect(formatApprovalPaymentDate("2026-11-15")).toBe("2026-11-15T00:00:00+08:00");
    expect(formatApprovalPaymentDate("2026-11-15 08:30:00")).toBe("2026-11-15T00:00:00+08:00");
    expect(() => formatApprovalPaymentDate("")).toThrow("请填写需求付款日期");
    expect(() => formatApprovalPaymentDate("2026/11/15")).toThrow("请填写需求付款日期");

    const entry = {
      amount: 100,
      currency: "MXN",
      payee: "HUAWEI",
      bankAccount: "1",
      bankName: "bank",
      swiftCode: "SWIFT",
      feeKey: "none" as const,
      paymentDate: "2026-11-15",
      invoiceIssued: false,
      customerKey: "mkmc9br3-u2m28i1ldp-0",
      attachmentTokens: [],
    };
    const huaweiRows = buildCostPaymentForm("huawei", { reason: "r", companyKey: "c", entries: [entry] })[4]
      .value as Array<Array<{ id: string; value: unknown }>>;
    const huaweiColumns = Object.fromEntries(huaweiRows[0].map((item) => [item.id, item]));
    expect(huaweiColumns.widget17688936318320001.value).toBe("2026-11-15T00:00:00+08:00");
  });

  it("校验：金额、银行账户、附件、承接单位一致性", () => {
    expect(validateCostPaymentEntries("compute", [baseEntry])).toBe("");

    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, amount: 0 }])).toContain("金额必须大于 0");
    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, bankAccount: "" }])).toContain("银行账户");
    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, swiftCode: "" }])).toContain("SWIFT CODE");
    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, orderNo: "" }])).toContain("订单号");
    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, paymentDate: "2000-01-01" }])).toContain("不能早于今天");
    expect(
      validateCostPaymentEntries("compute", [baseEntry, { ...baseEntry, ownerId: "po-2", undertakingUnitCode: "HKGS01" }]),
    ).toContain("承接单位不一致");
    expect(validateCostPaymentEntries("compute", [{ ...baseEntry, undertakingUnitCode: "AGTS01" }])).toContain("没有对应的公司选项");
    expect(validateCostPaymentEntries("huawei", [{ ...baseEntry, customerName: "未知客户" }])).toContain("客户名称没有对应的审批选项");
  });
});
