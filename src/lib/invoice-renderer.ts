import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trimTrailingEmptyColumns } from "./invoice-html-trim";

/**
 * 商业 Invoice 渲染器。
 *
 * 版式与 BI 的 `InvoiceRenderer.php` 一致（普通版 / SGD 双币版两份模板），
 * 逻辑是逐行对齐的移植，差别只有两处**刻意**的参数化：
 *   1. 票号前缀：模板原文写死 `INV No.CI-WZ_${num}`，我们改成 `INV No.${num}`，票号由系统按 `INV-<账期>-<流水>` 分配；
 *   2. 联系电话：模板原文写死 BI 的 `0755-86561930`，改成 `${telephone}` 由承接单位档案带出。
 *
 * 移植时用 BI 自带的两份样例做过逐字比对（见 invoice-renderer.test.ts），改模板前请先看该测试。
 */

export type InvoiceTemplateKind = "normal" | "sgd";

export type InvoiceLineInput = {
  /** 票面 TIME 列，一般填账期（2026-07）或期间 */
  date: string;
  /** Description */
  desc: string;
  /** 行金额；原模板数量恒为 1，金额同时作为单价与小计 */
  cost: string;
  /** 双币模板专用：该行 SGD 汇率，缺省按 1 处理会得到原币金额 */
  sgdRate?: string;
};

export type InvoiceRenderInput = {
  /** 完整票号，含前缀，例如 INV-202607-0001 */
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  paymentTermDays: string | number;
  currency: string;
  /** 含税总额，字符串传入避免浮点误差 */
  total: string;
  sellerName: string;
  sellerCountry: string;
  sellerAddress1: string;
  sellerAddress2?: string;
  sellerAddress3?: string;
  sellerTelephone?: string;
  sellerFinanceEmail?: string;
  bankAccountName?: string;
  bankName?: string;
  bankAddress?: string;
  bankSwiftCode?: string;
  bankCode?: string;
  bankAccount: string;
  customerName: string;
  customerAddress: string;
  /** 票面右侧 CUSTOMER CONTACT 下面那行：客户联系人姓名 */
  customerContact?: string;
  /** 客户联系信息第一行的标签（默认 Contact）与内容 */
  customerContactLabel?: string;
  customerContactValue?: string;
  /** 客户联系信息第二行的标签（默认 E-mail）与内容，一般是客户邮箱 */
  customerContactLabel2?: string;
  customerContactValue2?: string;
  comment?: string;
  /** 签章图：data URI 或可访问地址；留空则票面不显示签章 */
  authImg?: string;
  sgdTotal?: string;
  gstRegNo?: string;
  lines: InvoiceLineInput[];
};

const TEMPLATE_FILES: Record<InvoiceTemplateKind, string> = {
  normal: "invoice_tpl.xlsx",
  sgd: "invoice_tpl_sgd.xlsx",
};

const templateCache = new Map<string, string>();

/** 模板随代码走，按仓库根目录定位；两份模板都是「带 Excel 样式的 HTML」，不是标准 xlsx。 */
export function invoiceTemplatePath(kind: InvoiceTemplateKind) {
  return join(process.cwd(), "src", "lib", "invoice-templates", TEMPLATE_FILES[kind]);
}

export function loadInvoiceTemplate(kind: InvoiceTemplateKind) {
  const file = TEMPLATE_FILES[kind];
  const cached = templateCache.get(file);
  if (cached !== undefined) return cached;
  const html = readFileSync(invoiceTemplatePath(kind), "utf8");
  templateCache.set(file, html);
  return html;
}

/** BI 模板里票面最少 6 行明细，不足补空行。 */
export const INVOICE_MIN_ROWS = 6;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function escapeInvoiceHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** 等价 PHP number_format($v, 2, '.', ',')。 */
export function formatInvoiceNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value ?? "");
  const [int, dec] = Math.abs(numeric).toFixed(2).split(".");
  return `${numeric < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${dec}`;
}

/** 等价 date("F d, Y", strtotime($date))，票头那行「国家, Month DD, YYYY」要用。 */
export function formatInvoiceEnglishDate(value: unknown) {
  const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value ?? ""));
  if (!matched) return String(value ?? "");
  const month = MONTH_NAMES[Number(matched[2]) - 1] ?? "";
  return `${month} ${matched[3].padStart(2, "0")}, ${matched[1]}`;
}

const toChars = (value: unknown) => Array.from(String(value ?? ""));
const mbLength = (value: unknown) => toChars(value).length;
const mbSubstr = (value: unknown, start: number, length?: number) =>
  toChars(value).slice(start, length === undefined ? undefined : start + length).join("");

function mbStrRpos(value: unknown, search: string) {
  const chars = toChars(value);
  const needle = Array.from(search);
  for (let index = chars.length - needle.length; index >= 0; index -= 1) {
    if (chars.slice(index, index + needle.length).join("") === search) return index;
  }
  return -1;
}

/** 备注按字数折行，优先在空格处断；中文没有空格时按字数硬断。 */
function wrapCommentLine(line: string, maxLength: number) {
  const wrapped: string[] = [];
  let rest = line;
  while (mbLength(rest) > maxLength) {
    const breakFound = mbStrRpos(mbSubstr(rest, 0, maxLength), " ");
    const breakPosition = breakFound === -1 ? maxLength : breakFound;
    wrapped.push(mbSubstr(rest, 0, breakPosition).replace(/\s+$/, ""));
    rest = mbSubstr(rest, breakPosition).replace(/^\s+/, "");
  }
  wrapped.push(rest);
  return wrapped;
}

function formatInvoiceComment(comment: unknown, maxLength: number) {
  const grouped: string[] = [];
  String(comment ?? "").split(/\r\n|\r|\n/).forEach((line, index) => {
    const limit = index === 0 ? Math.max(1, maxLength - "Comment:".length) : maxLength;
    grouped.push(...wrapCommentLine(line, limit));
  });
  return { html: grouped.map(escapeInvoiceHtml).join("<br>"), lineCount: Math.max(1, grouped.length) };
}

/**
 * 票面单元格很窄（模板是 Excel 版式，格子宽度固定），长名称/地址会顶出边框。
 * 这里按字数在空格处折行——模板单元格本身就用 `<br>` 换行，效果与 BI 手工回车一致。
 * 各字段的字数上限见 CELL_WRAP_LIMITS，取值偏保守：宁可早换行，也不要压框线。
 */
const CELL_WRAP_LIMITS: Record<string, number> = {
  // 票面是 Excel 版式、格子宽度固定：下面这些值是按各格宽估算的保守上限，
  // 宁可早换一行，也不要让文字压到框线上。
  company_body: 34,
  invoice_name: 26,
  address: 34,
  company_body_address_01: 30,
  company_body_address_02: 30,
  company_body_address_03: 30,
  bank_name: 26,
  finance_name: 24,
  bank_address: 28,
  account_number: 22,
  swift_code: 22,
  bank_number: 16,
  linkman: 22,
};

function wrapCellText(value: unknown, maxChars: number) {
  const source = String(value ?? "").trim();
  if (!source) return "";
  const lines: string[] = [];
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    let rest = rawLine;
    while (mbLength(rest) > maxChars) {
      const chunk = mbSubstr(rest, 0, maxChars);
      const at = mbStrRpos(chunk, " ");
      const position = at === -1 ? maxChars : at;
      lines.push(mbSubstr(rest, 0, position).replace(/\s+$/, ""));
      rest = mbSubstr(rest, position).replace(/^\s+/, "");
    }
    lines.push(rest);
  }
  return lines.map(escapeInvoiceHtml).join("<br>");
}

/** 备注折行后按行数算合并单元格高度（WPS 不会自动扩高，必须给值）。 */
function prepareInvoiceComment(info: Record<string, unknown>, sgd: boolean) {
  const maxLength = sgd ? 22 : 30;
  const { html, lineCount } = formatInvoiceComment(info.comment, maxLength);
  const firstRowHeight = sgd ? 17 : 12.75;
  const otherRowsHeight = sgd ? 34 : 25.5;
  const required = Math.max(firstRowHeight + otherRowsHeight, lineCount * 18 + 6);
  info.comment = html;
  info.comment_first_row_height = required - otherRowsHeight;
}

function normalRowTemplate() {
  return `<tr height="40" class="xl73" style='height:30.00pt;mso-height-source:userset;mso-height-alt:600;'>
    <td class="xl129" height="40" style='height:30.00pt;'></td>
    <td class="xl130" x:str >\${date}</td>
    <td class="xl131" x:str>\${desc}<font class="font19"><span style='mso-spacerun:yes;'>&nbsp;</span></font></td>
    <td class="xl132"  >1<span style='mso-spacerun:yes;'>&nbsp;</span></td>
    <td class="xl133"  ><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span>\${cost}<span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl134" ><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>\${cost}</td>
    <td class="xl135"></td>
    <td class="xl129" colspan="3" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="3" style='mso-ignore:colspan;'></td>
   </tr>`;
}

function normalEmptyRowTemplate() {
  return `<tr height="41" class="xl73" style='height:30.75pt;mso-height-source:userset;mso-height-alt:615;'>
    <td class="xl129" height="41" style='height:30.75pt;'></td>
    <td class="xl130"></td>
    <td class="xl131"></td>
    <td class="xl132"></td>
    <td class="xl133"></td>
    <td class="xl134"></td>
    <td class="xl135"></td>
    <td class="xl129" colspan="3" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="3" style='mso-ignore:colspan;'></td>
   </tr>`;
}

function sgdRowTemplate() {
  return `   <tr height="40" class="xl73" style='height:30.00pt;mso-height-source:userset;mso-height-alt:600;'>
    <td class="xl130" height="40" style='height:30.00pt;'></td>
    <td class="xl131" x:str>\${date}</td>
    <td class="xl132" x:str>\${desc}<span style='mso-spacerun:yes;'>&nbsp;</span></td>
    <td class="xl133" x:num="1.">1.00<span style='mso-spacerun:yes;'>&nbsp;</span></td>
    <td class="xl134"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>\${sgd_cost}<span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl134"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>\${cost}<span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl135"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>\${cost}<span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl136"></td>
    <td class="xl130" colspan="3" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="2" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="2" style='mso-ignore:colspan;'></td>
   </tr>`;
}

function sgdEmptyRowTemplate() {
  return `   <tr height="40" class="xl73" style='height:30.00pt;mso-height-source:userset;mso-height-alt:600;'>
    <td class="xl130" height="40" style='height:30.00pt;'></td>
    <td class="xl131" x:str></td>
    <td class="xl132" x:str><span style='mso-spacerun:yes;'>&nbsp;</span></td>
    <td class="xl133" ><span style='mso-spacerun:yes;'>&nbsp;</span></td>
    <td class="xl134"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl134"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl135"><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><span style='mso-spacerun:yes;'>&nbsp;&nbsp;&nbsp;</span></td>
    <td class="xl136"></td>
    <td class="xl130" colspan="3" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="2" style='mso-ignore:colspan;'></td>
    <td class="xl73" colspan="2" style='mso-ignore:colspan;'></td>
   </tr>`;
}

/**
 * 票面必填项检查：模板缺字段会直接抛错，所以生成前先给出人话提示，
 * 让用户知道该去承接单位/客户档案补哪一项。
 */
export function collectMissingInvoiceFields(input: Partial<InvoiceRenderInput>, template: InvoiceTemplateKind = "normal") {
  const required: Array<[keyof InvoiceRenderInput, string]> = [
    ["invoiceNo", "发票号"],
    ["invoiceDate", "开票日期"],
    ["dueDate", "到期日"],
    ["currency", "币种"],
    ["total", "含税金额"],
    ["sellerName", "开票主体名称（承接单位档案）"],
    ["sellerCountry", "开票主体国家（承接单位档案）"],
    ["sellerAddress1", "开票主体注册地址（承接单位档案）"],
    ["bankAccount", "收款银行账号（承接单位银行账户）"],
    ["customerName", "客户抬头（客户档案）"],
    ["customerAddress", "客户发票地址（客户档案）"],
  ];
  const missing = required
    .filter(([key]) => key !== "total" && String(input[key] ?? "").trim() === "")
    .map(([, label]) => label);
  if (String(input.total ?? "").trim() === "" || Number.isNaN(Number(input.total))) missing.push("含税金额");
  if (!input.lines?.length) missing.push("至少一行明细");
  if (template === "sgd" && String(input.sgdTotal ?? "").trim() === "") missing.push("SGD 总金额");
  return missing;
}

export function renderInvoice(input: InvoiceRenderInput, options: { template?: InvoiceTemplateKind } = {}) {
  const template = options.template ?? "normal";
  const sgd = template === "sgd";
  let tplHtml = loadInvoiceTemplate(template);

  /**
   * 没有签章图时，模板里的 `<img src='${auth_img}'>` 会渲染成"破图"占位（浏览器显示破图图标），
   * 所以这里把整个 img 标签摘掉，票面留空即可。
   */
  if (!String(input.authImg ?? "").trim()) {
    tplHtml = tplHtml.replace(/<img[^>]*src='\$\{auth_img\}'[^>]*>/i, "");
  }

  // 与 BI 一致：先算出所有派生字段，再一次性替换占位符。
  const infodata: Record<string, unknown> = {
    num: input.invoiceNo,
    invoice_date: input.invoiceDate,
    due_date: input.dueDate,
    days: String(input.paymentTermDays ?? ""),
    unit: input.currency,
    total: formatInvoiceNumber(input.total),
    invoice_name: input.customerName,
    address: input.customerAddress,
    linkman: input.customerContact ?? "",
    formattedDate: formatInvoiceEnglishDate(input.invoiceDate),
    invoice_num_notice: "Remittance, please be sure to note the number",
    company_body: input.sellerName,
    company_area: input.sellerCountry,
    company_body_address_01: input.sellerAddress1,
    company_body_address_02: input.sellerAddress2 ?? "",
    company_body_address_03: input.sellerAddress3 ?? "",
    telephone: input.sellerTelephone ?? "",
    finance_email: input.sellerFinanceEmail ?? "",
    bank_name: input.bankName ?? "",
    bank_address: input.bankAddress ?? "",
    swift_code: input.bankSwiftCode ?? "",
    bank_number: input.bankCode ?? "",
    finance_name: input.bankAccountName ?? input.sellerName,
    account_number: input.bankAccount,
    customer_contact_name_1: input.customerContactLabel ?? "Contact",
    customer_contact_value_1: input.customerContactValue ?? "",
    customer_contact_name_2: input.customerContactLabel2 ?? "E-mail",
    customer_contact_value_2: input.customerContactValue2 ?? "",
    gst_reg_no: input.gstRegNo ?? "",
    auth_img: input.authImg ?? "",
    comment: input.comment ?? "",
  };
  if (sgd) infodata.sgd_total = formatInvoiceNumber(input.sgdTotal ?? "0");

  prepareInvoiceComment(infodata, sgd);

  for (const [key, value] of Object.entries(infodata)) {
    const limit = CELL_WRAP_LIMITS[key];
    const replacement = key === "comment"
      ? String(value ?? "")
      : limit
        ? wrapCellText(value, limit)
        : escapeInvoiceHtml(value);
    tplHtml = tplHtml.split("${" + key + "}").join(replacement);
  }

  const rowTemplate = sgd ? sgdRowTemplate() : normalRowTemplate();
  const emptyRowTemplate = sgd ? sgdEmptyRowTemplate() : normalEmptyRowTemplate();

  let rows = "";
  for (const line of input.lines) {
    const rowData: Record<string, unknown> = { date: line.date, desc: line.desc, cost: line.cost };
    if (sgd) {
      rowData.sgd_cost = Math.round(Number(line.sgdRate ?? 1) * Number(line.cost) * 100) / 100;
    }
    let lineHtml = rowTemplate;
    for (const [field, value] of Object.entries(rowData)) {
      lineHtml = lineHtml.split("${" + field + "}").join(escapeInvoiceHtml(value));
    }
    rows += lineHtml;
  }
  for (let index = input.lines.length; index < INVOICE_MIN_ROWS; index += 1) rows += emptyRowTemplate;
  tplHtml = tplHtml.split("${month_boy}").join(rows);

  const unresolved = /\$\{([^}]+)\}/.exec(tplHtml);
  if (unresolved) throw new Error(`票面模板缺少字段：${unresolved[1]}`);
  // 模板每行末尾都有一串只为对齐的空单元格，会把票面撑得很宽（打印/PDF 右侧一大片空白）
  return trimTrailingEmptyColumns(tplHtml);
}
