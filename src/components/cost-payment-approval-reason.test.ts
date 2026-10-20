import { describe, expect, it } from "vitest";
import { defaultReason, formatApprovalAmount } from "./cost-payment-approval-modal";

describe("成本款付款申请默认付款事由", () => {
  it("金额用千分位并保留两位小数", () => {
    expect(formatApprovalAmount(12345.6)).toBe("12,345.60");
    expect(formatApprovalAmount(799474.81)).toBe("799,474.81");
    expect(formatApprovalAmount(0)).toBe("0.00");
  });

  it("华为云按账期和供应商全称生成", () => {
    expect(defaultReason("huawei", [{
      period: "202607",
      supplierName: "HUAWEI MEXICO",
      supplierFullName: "HUAWEI TECHNOLOGIES DE MEXICO",
      amount: 12345.6,
      currency: "USD",
      projectNo: "",
      projectName: "",
      ownerNo: "202607",
      countryCode: "",
      countryName: "",
      batchNo: "",
      quantity: 0,
      requestNos: [],
    }])).toBe("支付华为云 202607 账期（HUAWEI TECHNOLOGIES DE MEXICO）货款金额：12,345.60USD");
  });

  it("集采按项目名称生成", () => {
    expect(defaultReason("other", [{
      period: "2026-07",
      supplierName: "诺可信",
      supplierFullName: "深圳市诺可信科技股份有限公司",
      amount: 57510.5,
      currency: "CNY",
      projectNo: "PJ-20260901-0001",
      projectName: "滴滴二次扩容",
      ownerNo: "117721",
      countryCode: "",
      countryName: "",
      batchNo: "",
      quantity: 0,
      requestNos: [],
    }])).toBe("支付集采项目滴滴二次扩容成本货款金额：57,510.50CNY");
  });

  it("算力带国家、批次、数量、需求单号和供应商全称", () => {
    expect(defaultReason("compute", [{
      period: "2026-07-01",
      supplierName: "HUAWEI",
      supplierFullName: "HUAWEI TECHNOLOGIES DE MEXICO",
      amount: 799474.81,
      currency: "USD",
      projectNo: "",
      projectName: "",
      ownerNo: "PO-eSHWC26070111fm",
      countryCode: "MX",
      countryName: "墨西哥",
      batchNo: "MX-49",
      quantity: 16,
      requestNos: ["eSHWC26070111fm", "eSHWC26070112fm"],
    }])).toBe(
      "墨西哥MX-49的16PCS，需求单号eSHWC26070111fm、(eSHWC26070112fm)支付HUAWEI TECHNOLOGIES DE MEXICO设备款，金额为799,474.81USD",
    );
  });

  it("多张单据用中文分号连接", () => {
    const row = {
      period: "202607",
      supplierName: "A",
      supplierFullName: "A LIMITED",
      amount: 100,
      currency: "USD",
      projectNo: "",
      projectName: "",
      ownerNo: "",
      countryCode: "",
      countryName: "",
      batchNo: "",
      quantity: 0,
      requestNos: [],
    };
    expect(defaultReason("huawei", [row, row])).toBe(
      "支付华为云 202607 账期（A LIMITED）货款金额：100.00USD；支付华为云 202607 账期（A LIMITED）货款金额：100.00USD",
    );
  });
});
