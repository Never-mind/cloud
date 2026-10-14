import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { extractOfdPages, extractOfdPageText } from "./ofd-text-extract";
import { parseChinaVatInvoice } from "./china-vat-invoice-parser";

/**
 * OFD 文字层样例：按真实版式文件的结构构造（TextObject 带 Boundary 坐标，
 * 同一行被拆成多个 TextCode），文字内容取自匿名化的发票样例。
 */
const CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Content>
    <ofd:Layer ID="1">
      <ofd:TextObject ID="1" Boundary="40 30 120 10">
        <ofd:TextCode X="0" Y="0">电子发票（普通发票）</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="1b" Boundary="130 30 200 10">
        <ofd:TextCode X="0" Y="0">发票号码：26000000000000000001</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="2" Boundary="40 45 80 10">
        <ofd:TextCode X="0" Y="0">开票日期：2026年08月17日</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="3" Boundary="40 60 400 10">
        <ofd:TextCode X="0" Y="0">名称：示例采购方科技有限公司</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="3b" Boundary="240 60 120 10">
        <ofd:TextCode X="0" Y="0">名称：示例城市某某网络设</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="3c" Boundary="360 60 60 10">
        <ofd:TextCode X="0" Y="0">备商行</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="4" Boundary="40 75 200 10">
        <ofd:TextCode X="0" Y="0">统一社会信用代码/纳税人识别号：910000000000000001</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="4b" Boundary="260 75 200 10">
        <ofd:TextCode X="0" Y="0">统一社会信用代码/纳税人识别号：920000000000000002</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="5" Boundary="40 105 400 10">
        <ofd:TextCode X="0" Y="0">*通 信 传 输 设 备 *光模 块 个 10 742.57 1% 7.43</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="5" Boundary="40 120 300 10">
        <ofd:TextCode X="0" Y="0">合 计 ¥742.57 ¥7.43</ofd:TextCode>
      </ofd:TextObject>
      <ofd:TextObject ID="6" Boundary="40 135 400 10">
        <ofd:TextCode X="0" Y="0">价税合计（大写） 柒佰 伍拾圆整 （小写）</ofd:TextCode>
        <ofd:TextCode X="300" Y="0">¥750.00</ofd:TextCode>
      </ofd:TextObject>
    </ofd:Layer>
  </ofd:Content>
</ofd:Page>`;

describe("OFD 文字层抽取", () => {
  it("按坐标还原成行，同一对象的字块不插空格", () => {
    const text = extractOfdPageText(CONTENT_XML);
    const lines = text.split("\n");
    expect(lines[0]).toBe("电子发票（普通发票） 发票号码：26000000000000000001");
    expect(lines[1]).toBe("开票日期：2026年08月17日");
    // 不同对象之间补空格；同一对象里被拆开的字块不补（"备商行" 接着 "网络设"）
    expect(lines[2]).toBe("名称：示例采购方科技有限公司 名称：示例城市某某网络设 备商行");
    expect(lines[3]).toBe("统一社会信用代码/纳税人识别号：910000000000000001 统一社会信用代码/纳税人识别号：920000000000000002");
    expect(lines[5]).toBe("合 计 ¥742.57 ¥7.43");
    // 同一对象内的两段（"（小写）" 与 "¥750.00"）不插空格，正好还原成票面写法
    expect(lines[6]).toBe("价税合计（大写） 柒佰 伍拾圆整 （小写）¥750.00");
  });

  it("还原出来的文本可以直接交给中国增值税发票解析", () => {
    const invoice = parseChinaVatInvoice(extractOfdPageText(CONTENT_XML));
    expect(invoice.invoiceNo).toBe("26000000000000000001");
    expect(invoice.invoiceDate).toBe("2026-08-17");
    expect(invoice.sellerName).toBe("示例城市某某网络设备商行");
    expect(invoice.buyerTaxNumber).toBe("910000000000000001");
    expect(invoice.totalIncludingTax).toBe(750);
    expect(invoice.taxRate).toBe(1);
  });

  it("从 OFD（zip）里按页读出文字", () => {
    const zip = zipSync({
      "OFD.xml": strToU8("<ofd:OFD><ofd:DocBody/></ofd:OFD>"),
      "Doc_0/Pages/Page_0/Content.xml": strToU8(CONTENT_XML),
    });
    const pages = extractOfdPages(Buffer.from(zip));
    expect(pages).toHaveLength(1);
    expect(pages[0]).toContain("发票号码：26000000000000000001");
  });

  it("坏文件给出人话提示", () => {
    expect(() => extractOfdPages(Buffer.from("not a zip"))).toThrow(/OFD/);
  });
});
