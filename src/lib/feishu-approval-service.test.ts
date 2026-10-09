import { afterEach, describe, expect, it } from "vitest";
import {
  APPROVAL_FIELDS,
  CFDI_OPTIONS,
  CHILE_INVOICE_TYPE_OPTIONS,
  CHILE_NOTE2_OPTIONS,
  COMPANY_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  buildInvoiceApprovalForm,
  getInvoiceApprovalCode,
  resolveInvoiceApprovalParty,
  type InvoiceApprovalFormInput,
} from "./feishu-approval-service";

afterEach(() => {
  delete process.env.FEISHU_INVOICE_APPROVAL_CODE;
});

function mexicoForm(): InvoiceApprovalFormInput {
  return {
    branch: "mx",
    companyOptionKey: COMPANY_OPTIONS.newmedia.key,
    purpose: "202610 · 华为（墨西哥）· 滴滴5台F5",
    paymentReceivedTime: "2026-11-08",
    mexico: {
      customerName: "DAS Payments Mexico, S.A. de C.V.",
      taxId: "DPM2305243F7",
      taxRegime: "Régimen General de Ley Personas Morales",
      paymentMethodKey: PAYMENT_METHOD_OPTIONS.PPD.key,
      address: "Av. Reforma 509",
      postCode: "06500",
      amountIncludingTax: 207475.37,
      invoiceContent: "project",
      cfdiCodeKey: CFDI_OPTIONS.G03.key,
      cfsFileTokens: ["token-1"],
    },
  };
}

describe("飞书审批开票 · 表单组装", () => {
  it("墨西哥分支带客户信息、开票金额和 CSF 附件", () => {
    const fields = buildInvoiceApprovalForm(mexicoForm());
    const ids = fields.map((field) => field.id);
    expect(ids).toEqual([
      APPROVAL_FIELDS.purpose,
      APPROVAL_FIELDS.companyName,
      APPROVAL_FIELDS.paymentReceivedTime,
      APPROVAL_FIELDS.customerInfo,
      APPROVAL_FIELDS.invoiceInfo,
      APPROVAL_FIELDS.customerCfs,
    ]);

    const customerInfo = fields.find((field) => field.id === APPROVAL_FIELDS.customerInfo);
    const customerRow = (customerInfo?.value as Array<Array<{ id: string; value: unknown }>>)[0];
    expect(customerRow.map((item) => item.id)).toEqual([
      APPROVAL_FIELDS.customerName,
      APPROVAL_FIELDS.taxId,
      APPROVAL_FIELDS.taxRegime,
      APPROVAL_FIELDS.paymentMethod,
      APPROVAL_FIELDS.address,
      APPROVAL_FIELDS.postCode,
    ]);
    expect(customerRow.find((item) => item.id === APPROVAL_FIELDS.paymentMethod)?.value).toBe(PAYMENT_METHOD_OPTIONS.PPD.key);

    const invoiceInfo = fields.find((field) => field.id === APPROVAL_FIELDS.invoiceInfo);
    const invoiceRow = (invoiceInfo?.value as Array<Array<{ id: string; value: unknown }>>)[0];
    expect(invoiceRow.find((item) => item.id === APPROVAL_FIELDS.amountIncludingTax)?.value).toBe(207475.37);
    expect(invoiceRow.find((item) => item.id === APPROVAL_FIELDS.cfdiCode)?.value).toBe(CFDI_OPTIONS.G03.key);
    expect(fields.find((field) => field.id === APPROVAL_FIELDS.customerCfs)?.value).toEqual(["token-1"]);
  });

  it("墨西哥分支缺 CSF 附件时直接拦下（审批里是必填）", () => {
    const form = mexicoForm();
    form.mexico!.cfsFileTokens = [];
    expect(() => buildInvoiceApprovalForm(form)).toThrow(/CSF/);
  });

  it("智利分支只带智利字段，不带墨西哥字段", () => {
    const fields = buildInvoiceApprovalForm({
      branch: "cl",
      companyOptionKey: COMPANY_OPTIONS.technology.key,
      purpose: "202610 · 智利 · 算力服务",
      paymentReceivedTime: "2026-12-01",
      chile: {
        customerLabel: "Customer: SPARKOO TECHNOLOGIES CHILE SPA",
        invoiceTypeKey: CHILE_INVOICE_TYPE_OPTIONS.service.key,
        amountIncludingTax: 12345,
        note1: "备注一",
        note2Key: CHILE_NOTE2_OPTIONS.service.key,
        note3: 1,
        note4: 2,
      },
    });
    const ids = fields.map((field) => field.id);
    expect(ids).toEqual([APPROVAL_FIELDS.purpose, APPROVAL_FIELDS.companyName, APPROVAL_FIELDS.paymentReceivedTime, APPROVAL_FIELDS.chileNote, APPROVAL_FIELDS.chileInvoiceInfo]);
    expect(ids).not.toContain(APPROVAL_FIELDS.customerInfo);
    expect(ids).not.toContain(APPROVAL_FIELDS.customerCfs);
  });

  it("巴西分支只带公共字段（实际走本地开票，不会提交）", () => {
    const fields = buildInvoiceApprovalForm({
      branch: "br",
      companyOptionKey: COMPANY_OPTIONS.brazil.key,
      purpose: "202610 · 巴西",
      paymentReceivedTime: "2026-12-01",
    });
    expect(fields.map((field) => field.id)).toEqual([APPROVAL_FIELDS.purpose, APPROVAL_FIELDS.companyName, APPROVAL_FIELDS.paymentReceivedTime]);
  });
});

describe("飞书审批开票 · 主体解析", () => {
  it("按承接单位编码解析", () => {
    expect(resolveInvoiceApprovalParty({ undertakingUnitCode: "MXGS01" })?.optionKey).toBe(COMPANY_OPTIONS.newmedia.key);
    expect(resolveInvoiceApprovalParty({ undertakingUnitCode: "clgs01" })?.branch).toBe("cl");
    expect(resolveInvoiceApprovalParty({ undertakingUnitCode: "BRGS01" })?.branch).toBe("br");
  });

  it("编码缺失时按名称关键词兜底（Jixun 目前不在承接单位档案里）", () => {
    expect(resolveInvoiceApprovalParty({ undertakingUnitName: "Jixun Technologies de Mexico" })?.optionKey).toBe(COMPANY_OPTIONS.jixun.key);
    expect(resolveInvoiceApprovalParty({ undertakingUnitName: "Luz Technology SPA" })?.branch).toBe("cl");
    expect(resolveInvoiceApprovalParty({ undertakingUnitName: "欣喜连连" })).toBeNull();
  });
});

describe("飞书审批开票 · 审批定义 code", () => {
  it("默认用 Cloud invoicing process，可用环境变量覆盖", () => {
    expect(getInvoiceApprovalCode()).toBe("ABBC8240-2CA4-4A33-8E58-AC91FC8648F2");
    process.env.FEISHU_INVOICE_APPROVAL_CODE = "OTHER-CODE";
    expect(getInvoiceApprovalCode()).toBe("OTHER-CODE");
  });
});
