import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INVOICE_MIN_ROWS,
  collectMissingInvoiceFields,
  formatInvoiceEnglishDate,
  formatInvoiceNumber,
  renderInvoice,
  type InvoiceRenderInput,
} from "./invoice-renderer";
import { trimTrailingEmptyColumns } from "./invoice-html-trim";

/**
 * 金标准：BI 的两份样例输出（output/invoice.html、output/invoice-sgd.html）原样存成基线。
 * 允许的差异：
 *   1. 票号前缀 —— BI 模板里写死的 `CI-WZ_` 已参数化，票号由系统按 INV-<账期>-<流水> 分配；
 *   2. 没有签章图时不输出 `src=''` 的破图占位；
 *   3. 裁掉右侧全空列；
 *   4. FROM 的 CONTACT 一格：BI 原版填的是单位名称，按业务口径应为**承接单位联系人**；
 *      TO 的第二行：BI 原版与 CUSTOMER CONTACT 重复用客户联系人，按业务口径应为**客户电话**。
 *      这两处是 2026-10-14 修正的，基线文件里已同步替换成正确值。
 * 这两个用例的作用是：以后谁改了模板或渲染逻辑，只要票面版式跑偏就会立刻红。
 */
const BASELINE_DIR = join(process.cwd(), "src", "lib", "invoice-templates");

function biBaseline(file: string) {
  return readFileSync(join(BASELINE_DIR, file), "utf8")
    .split("INV No.CI-WZ_DEMO-202609-0001")
    .join("INV No.DEMO-202609-0001")
    // 第二处有意差异：BI 在没签章图时会输出 `src=''` 的破图占位，我们整段去掉，
    // 所以比对前也从基线里摘掉这一段。
    .replace(/<img[^>]*src=''[^>]*>/i, "")
    // 第三处有意差异：裁掉右侧全空列（BI 原版会把票面撑到 1069.5pt，右边一片空白）
    .replace(/<html[\s\S]*$/i, (matched) => trimTrailingEmptyColumns(matched));
}

/** BI 示例入参 → 我们的渲染入参（字段一一对应，不改变语义）。 */
function demoInput(kind: "normal" | "sgd"): InvoiceRenderInput {
  const normal: InvoiceRenderInput = {
    invoiceNo: "DEMO-202609-0001",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-30",
    paymentTermDays: "30",
    currency: "USD",
    total: "1000.00",
    sellerName: "Example Company Ltd.",
    sellerCountry: "Hong Kong",
    sellerAddress1: "Example address line 1",
    sellerAddress2: "Example address line 2",
    sellerAddress3: "",
    sellerTelephone: "0755-86561930",
    sellerContactName: "Example Contact Person",
    sellerFinanceEmail: "finance@example.com",
    bankAccountName: "Example Company Ltd.",
    bankName: "Example Bank",
    bankAddress: "Example bank address",
    bankSwiftCode: "DEMOXXXX",
    bankCode: "DEMO",
    bankAccount: "DEMO-ACCOUNT-0001",
    customerName: "Example Customer Ltd.",
    customerAddress: "Customer address line 1",
    customerContact: "Example Contact",
    customerContactLabel: "Telephone",
    customerContactValue: "021-12345678",
    customerContactLabel2: "Email",
    customerContactValue2: "customer@example.com",
    comment: "示例数据，仅用于模板演示。",
    authImg: "",
    gstRegNo: "",
    lines: [{ date: "2026-09", desc: "Advertising service", cost: "1000.00" }],
  };
  if (kind === "normal") return normal;
  return {
    ...normal,
    // 注意：双币模板只是多一列 SGD 金额与 SGD 合计，票面币种仍是原币（BI 样例里也是 USD）
    sellerName: "Example Company PTE. LTD.",
    sellerCountry: "Singapore",
    gstRegNo: "GST Reg No: DEMO",
    sgdTotal: "1300.00",
    lines: [{ date: "2026-09", desc: "Advertising service", cost: "1000.00", sgdRate: "1.30" }],
  };
}

describe("invoice renderer", () => {
  it("普通模板的渲染结果与 BI 原始输出一致（仅票号前缀按我们的规则）", () => {
    expect(renderInvoice(demoInput("normal"))).toBe(biBaseline("bi-baseline.html"));
  });

  it("FROM 的 CONTACT 显示联系人，TO 是 客户联系人 / 客户电话 / 客户邮箱 三项", () => {
    const html = renderInvoice({
      ...demoInput("normal"),
      sellerContactName: "Kelly Chan",
      customerContact: "Juan Perez",
      customerContactLabel: "Telephone",
      customerContactValue: "+52 55 1234 5678",
      customerContactValue2: "juan.perez@das.mx",
    });
    const contactRow = html.split("</tr>").find((row) => />CONTACT</.test(row)) ?? "";
    expect(contactRow).toContain("Kelly Chan");
    // 以前这里错填成单位名称
    expect(contactRow).not.toContain("Example Company Ltd.");
    const phoneRow = html.split("</tr>").find((row) => />TELEPHONE</.test(row)) ?? "";
    expect(phoneRow).toContain("Telephone");
    expect(phoneRow).toContain("+52 55 1234 5678");
    // 以前这一格又写了一遍客户联系人姓名，和 CUSTOMER CONTACT 重复
    expect(phoneRow).not.toContain("Juan Perez");
    expect(html).toContain("juan.perez@das.mx");
  });

  it("没有签章图时不输出 img 标签（避免票面上出现破图占位）", () => {
    const withoutSeal = renderInvoice(demoInput("normal"));
    expect(withoutSeal).not.toContain("${auth_img}");
    expect(withoutSeal).not.toMatch(/<img[^>]*src=''/);
    expect(withoutSeal).not.toContain("<img");
    const withSeal = renderInvoice({ ...demoInput("normal"), authImg: "data:image/png;base64,iVBORw0KGgo=" });
    expect(withSeal).toContain("data:image/png;base64,iVBORw0KGgo=");
  });

  it("双币模板的渲染结果与 BI 原始输出一致", () => {
    expect(renderInvoice(demoInput("sgd"), { template: "sgd" })).toBe(biBaseline("bi-baseline-sgd.html"));
  });

  it("英文名 / 地址 / 银行信息只要没真超宽就不折行（按显示宽度，不按字数）", () => {
    const html = renderInvoice({
      ...demoInput("normal"),
      // 香港万众这一组是实际踩过的：英文字符数比中文字数上限大，但显示宽度远不到一行的宽度
      sellerName: "HK WANZHONG TECHNOLOGY LIMITED",
      bankAccountName: "HK WANZHONG TECHNOLOGY LIMITED",
      bankName: "DBS BANK (HONG KONG) LIMITED",
      bankAddress: "FLOOR 11, THE CENTER, 99 QUEENS ROAD",
    });
    expect(html).toContain("HK WANZHONG TECHNOLOGY LIMITED");
    expect(html).toContain("DBS BANK (HONG KONG) LIMITED");
    expect(html).toContain("FLOOR 11, THE CENTER, 99 QUEENS ROAD");
  });

  it("真的超过格子宽度才折行", () => {
    const sellerName = "LUZ NEWMEDIA, S.A. DE C.V. AND SUBSIDIARIES HOLDING LIMITED COMPANY OF MEXICO";
    const customerAddress = "AV. MONTERREY 100 Colonia ROMA, Alcaldia CUAUHTEMOC Ciudad de Mexico, C.P. 06700 CALLE LARGA";
    const html = renderInvoice({ ...demoInput("normal"), sellerName, customerAddress });
    expect(html).not.toContain(sellerName);
    expect(html).not.toContain(customerAddress);
    expect(html).toContain("<br>");
  });

  it("中文的折行位置和以前一致（34 个中文字放得下、35 个就要断）", () => {
    const fits = "甲".repeat(34);
    const overflow = "甲".repeat(35);
    expect(renderInvoice({ ...demoInput("normal"), customerAddress: fits })).toContain(fits);
    expect(renderInvoice({ ...demoInput("normal"), customerAddress: overflow })).not.toContain(overflow);
  });

  it("模板已经参数化：票号前缀与 BI 电话不再写死在模板里", () => {
    const normal = readFileSync(join(BASELINE_DIR, "invoice_tpl.xlsx"), "utf8");
    const sgd = readFileSync(join(BASELINE_DIR, "invoice_tpl_sgd.xlsx"), "utf8");
    for (const template of [normal, sgd]) {
      expect(template).toContain("INV No.${num}");
      expect(template).toContain("${telephone}");
      expect(template).not.toContain("CI-WZ_");
      expect(template).not.toContain("86561930");
    }
  });

  it("明细不足 6 行时补空行，且票面不残留未替换占位符", () => {
    const html = renderInvoice(demoInput("normal"));
    expect(html).not.toMatch(/\$\{[^}]+\}/);
    // 普通版空行模板的固定特征，1 行明细时应补 5 行
    const emptyRows = html.split("mso-height-alt:615").length - 1;
    expect(emptyRows).toBe(INVOICE_MIN_ROWS - 1);
    const threeLines = renderInvoice({ ...demoInput("normal"), lines: [
      { date: "2026-07", desc: "July fee", cost: "100.00" },
      { date: "2026-08", desc: "August fee", cost: "200.00" },
      { date: "2026-09", desc: "September fee", cost: "300.00" },
    ] });
    expect(threeLines.split("mso-height-alt:615").length - 1).toBe(INVOICE_MIN_ROWS - 3);
    expect(threeLines).toContain("July fee");
    expect(threeLines).toContain("September fee");
  });

  it("双币模板每行 SGD 金额 = 原币金额 × 汇率，四舍五入两位", () => {
    const html = renderInvoice(
      { ...demoInput("sgd"), lines: [{ date: "2026-07", desc: "Fee", cost: "2710.72", sgdRate: "1.315" }] },
      { template: "sgd" },
    );
    // 2710.72 × 1.315 = 3564.5968 → 3564.6（JS 数字转字符串不补零，与 PHP 一致）
    expect(html).toContain("3564.6");
  });

  it("备注按字数折行，并据此抬高备注单元格", () => {
    const short = renderInvoice(demoInput("normal"));
    const long = renderInvoice({
      ...demoInput("normal"),
      comment: "第一行备注很长很长很长很长很长很长很长很长很长很长很长\n第二行也不短，用来验证换行处理是否正确无误。",
    });
    expect(short).not.toContain("Comment:示例数据<br>");
    expect(long).toContain("<br>");
    // 备注单元格高度写在 style 里：height:<值>pt;mso-height-source:userset
    const heightOf = (html: string) => Number(/height:([0-9.]+)pt;mso-height-source:userset/.exec(html)?.[1] ?? 0);
    expect(heightOf(long)).toBeGreaterThan(0);
  });

  it("缺项检查给出人话提示，便于引导用户先去补档案", () => {
    const missing = collectMissingInvoiceFields({
      invoiceNo: "INV-202607-0001",
      invoiceDate: "2026-08-07",
      dueDate: "2026-09-06",
      currency: "USD",
      total: "2710.72",
      sellerName: "HK wangzhong",
      sellerCountry: "",
      sellerAddress1: "",
      bankAccount: "",
      customerName: "Hengshan Investment Limited",
      customerAddress: "",
      lines: [{ date: "2026-07", desc: "fee", cost: "2710.72" }],
    });
    expect(missing).toContain("开票主体国家（承接单位档案）");
    expect(missing).toContain("开票主体注册地址（承接单位档案）");
    expect(missing).toContain("收款银行账号（承接单位银行账户）");
    expect(missing).toContain("客户发票地址（客户档案）");
    expect(collectMissingInvoiceFields(demoInput("normal"))).toEqual([]);
    expect(collectMissingInvoiceFields({ ...demoInput("sgd"), sgdTotal: "" }, "sgd")).toContain("SGD 总金额");
  });

  it("金额千分位与英文日期格式与 BI 一致", () => {
    expect(formatInvoiceNumber("1938000")).toBe("1,938,000.00");
    expect(formatInvoiceNumber("2710.72")).toBe("2,710.72");
    expect(formatInvoiceEnglishDate("2026-09-30")).toBe("September 30, 2026");
    expect(formatInvoiceEnglishDate("2026-09-09")).toBe("September 09, 2026");
  });
});
