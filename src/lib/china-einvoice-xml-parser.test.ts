import { describe, expect, it } from "vitest";
import { parseChinaEinvoiceXml } from "./china-einvoice-xml-parser";

/**
 * 数电票 XML 没有唯一版式，各地/各服务商标签名不一样。
 * 样例按常见要素文件结构构造（Buyer/Seller 分组 + TotalAmWithTax 价税合计），值都是示例值。
 */
const EINVOICE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<EInvoice>
  <Header>
    <EINumber>26000000000000000001</EINumber>
    <IssueTime>2026-08-17</IssueTime>
    <InvoiceType>普通发票</InvoiceType>
  </Header>
  <Buyer>
    <BuyerName>示例采购方科技有限公司</BuyerName>
    <BuyerIdNum>910000000000000001</BuyerIdNum>
  </Buyer>
  <Seller>
    <SellerName>示例城市某某网络设备商行</SellerName>
    <SellerIdNum>920000000000000002</SellerIdNum>
  </Seller>
  <Goods>
    <GoodsName>光模块</GoodsName>
    <Quantity>10</Quantity>
    <TaxRate>0.01</TaxRate>
    <TaxAmount>7.43</TaxAmount>
  </Goods>
  <TotalAmWithoutTax>742.57</TotalAmWithoutTax>
  <TotalTax>7.43</TotalTax>
  <TotalAmWithTax>750.00</TotalAmWithTax>
</EInvoice>`;

/** 另一种标签口径 + 分组名不同，验证候选标签兜底。 */
const ALTERNATE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<InvoiceData xmlns:ns="http://example.com/einv">
  <ns:InvoiceNumber>26000000000000000002</ns:InvoiceNumber>
  <ns:InvoiceDate>2026年08月19日</ns:InvoiceDate>
  <ns:BuyerInfo>
    <ns:Name>示例采购方科技有限公司</ns:Name>
    <ns:TaxNumber>910000000000000001</ns:TaxNumber>
  </ns:BuyerInfo>
  <ns:SellerInfo>
    <ns:Name>示例国际物流有限公司</ns:Name>
    <ns:TaxNumber>920000000000000003</ns:TaxNumber>
  </ns:SellerInfo>
  <ns:TaxRate>0</ns:TaxRate>
  <ns:TotalAmountWithTax>245.00</ns:TotalAmountWithTax>
</InvoiceData>`;

describe("数电票 XML 解析", () => {
  it("按要素文件读出票号、日期、购销双方与金额", () => {
    const invoice = parseChinaEinvoiceXml(EINVOICE_XML);
    expect(invoice.invoiceNo).toBe("26000000000000000001");
    expect(invoice.invoiceDate).toBe("2026-08-17");
    expect(invoice.kind).toBe("普通发票");
    expect(invoice.buyerName).toBe("示例采购方科技有限公司");
    expect(invoice.buyerTaxNumber).toBe("910000000000000001");
    expect(invoice.sellerName).toBe("示例城市某某网络设备商行");
    expect(invoice.sellerTaxNumber).toBe("920000000000000002");
    expect(invoice.amountExcludingTax).toBe(742.57);
    expect(invoice.taxAmount).toBe(7.43);
    expect(invoice.totalIncludingTax).toBe(750);
    // 0.01 要归一成 1%
    expect(invoice.taxRate).toBe(1);
    expect(invoice.currency).toBe("CNY");
  });

  it("标签名不同（带命名空间 / 中文日期）也能读，缺价税合计时用 金额+税额 补", () => {
    const invoice = parseChinaEinvoiceXml(ALTERNATE_XML);
    expect(invoice.invoiceNo).toBe("26000000000000000002");
    expect(invoice.invoiceDate).toBe("2026-08-19");
    expect(invoice.buyerName).toBe("示例采购方科技有限公司");
    expect(invoice.sellerName).toBe("示例国际物流有限公司");
    expect(invoice.totalIncludingTax).toBe(245);
    expect(invoice.taxRate).toBe(0);
  });

  it("墨西哥 CFDI 的 XML 不会被当成数电票", () => {
    expect(() => parseChinaEinvoiceXml("<?xml version=\"1.0\"?><cfdi:Comprobante Total=\"1\"/>")).toThrow(/CFDI/);
  });

  it("要素文件里没有票号和日期时直接报错", () => {
    expect(() => parseChinaEinvoiceXml("<?xml version=\"1.0\"?><Foo><Bar>1</Bar></Foo>")).toThrow(/数电票/);
  });
});
