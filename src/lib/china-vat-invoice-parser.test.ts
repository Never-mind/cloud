import { describe, expect, it } from "vitest";
import { cleanupInvoiceName, parseChinaVatInvoice } from "./china-vat-invoice-parser";

/**
 * 样例按真实发票的文字层形状整理（含"设 备 商行"这种被 PDF 断行的写法），
 * 名称、税号、票号都换成了示例值。
 */
const NORMAL_INVOICE = `电子发票（普通发票） 发票号码：26000000000000000001
开票日期：2026年08月17日
购 销
名称：示例采购方科技有限公司 名称：示例城市某某网络设 备 商行（个体工商户）
买 售
方 方
信 信
统一社会信用代码/纳税人识别号：910000000000000001 统一社会信用代码/纳税人识别号：920000000000000002
息 息
项目名称 规格型号 单 位 数 量 单 价 金 额 税率/征收率 税 额
*通 信 传 输 设 备 *光模 块 个 10 74.2574257425743 742.57 1% 7.43
合 计 ¥742.57 ¥7.43
价税合计（大写） 柒佰 伍拾圆整 （小写）¥750.00
备
注
开票人：示例`;

const EXEMPT_INVOICE = `电子发票（普通发票） 发票号码：26000000000000000002
开票日期：2026年08月19日
购 销
名称：示例采购方科技有限公司 名称：示例国际物流有限公司
买 售
方 方
信 信
统一社会信用代码/纳税人识别号：910000000000000001 统一社会信用代码/纳税人识别号：920000000000000003
息 息
项目名称 规格型号 单 位 数 量 单 价 金 额 税率/征收率 税 额
*生产生活服务*国际货物 票 1 245.00 245.00 免税 ***
运输代理服务
合 计 ¥245.00 ***
贰佰肆拾伍圆整 ¥245.00
价税合计（大写） （小写）
销方开户银行:示例银行; 银行账号:0000000000000000000
备
注
开票人：示例`;

describe("中国增值税电子发票解析", () => {
  it("读出租方/购方、票号、日期与金额", () => {
    const invoice = parseChinaVatInvoice(NORMAL_INVOICE);
    expect(invoice.kind).toBe("普通发票");
    expect(invoice.invoiceNo).toBe("26000000000000000001");
    expect(invoice.invoiceDate).toBe("2026-08-17");
    expect(invoice.buyerName).toBe("示例采购方科技有限公司");
    // 票面断行成"设 备 商行"，解析后要还原成一个词
    expect(invoice.sellerName).toBe("示例城市某某网络设备商行（个体工商户）");
    expect(invoice.buyerTaxNumber).toBe("910000000000000001");
    expect(invoice.sellerTaxNumber).toBe("920000000000000002");
    expect(invoice.amountExcludingTax).toBe(742.57);
    expect(invoice.taxAmount).toBe(7.43);
    expect(invoice.totalIncludingTax).toBe(750);
    expect(invoice.taxRate).toBe(1);
    expect(invoice.currency).toBe("CNY");
  });

  it("免税票税额按 0，价税合计取不到小写金额时用 金额+税额 兜底", () => {
    const invoice = parseChinaVatInvoice(EXEMPT_INVOICE);
    expect(invoice.taxExempt).toBe(true);
    expect(invoice.taxRate).toBe(0);
    expect(invoice.taxAmount).toBe(0);
    expect(invoice.amountExcludingTax).toBe(245);
    expect(invoice.totalIncludingTax).toBe(245);
    expect(invoice.sellerName).toBe("示例国际物流有限公司");
  });

  it("不是增值税发票的文件直接报错", () => {
    expect(() => parseChinaVatInvoice("这是一张随便的 PDF 文字")).toThrow(/中国增值税/);
  });

  it("只压缩汉字之间的空白，英文名保留词间空格", () => {
    expect(cleanupInvoiceName("示例城市某某网络设 备 商行")).toBe("示例城市某某网络设备商行");
    expect(cleanupInvoiceName("DEMO  COMPANY  SA")).toBe("DEMO COMPANY SA");
  });
});
