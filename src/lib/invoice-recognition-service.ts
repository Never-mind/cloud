import { queryRows, type Row } from "./db";
import { extractPdfLayoutPages } from "./pdf-text-extract";
import { hkwzPdfRows, isHkwzInvoiceText, parseHkwzInvoice, parseHkwzWorkbook, type HkwzInvoice } from "./hkwz-invoice-parser";
import type { InvoicePartyFields } from "./invoice-party-fields";
import { parseChinaVatInvoice } from "./china-vat-invoice-parser";
import { parseCfdiInvoiceText } from "./cfdi-pdf-parser";
import { parseCfdiInvoice } from "./cfdi-invoice-parser";
import { isDazhuangCommercialInvoiceText, parseDazhuangCommercialInvoiceText } from "./commercial-invoice-parser";
import { isSingaporeInvoiceText, parseSingaporeInvoiceText } from "./sg-invoice-parser";
import { extractOfdPages } from "./ofd-text-extract";
import { parseChinaEinvoiceXml } from "./china-einvoice-xml-parser";
import type { ChinaVatInvoice } from "./china-vat-invoice-parser";
import { defaultInvoicePaymentTermDays } from "./invoice-payment-terms";

/**
 * 上传发票 → 自动识别 → 填进项目结算「发票管理」的新增发票表单。
 *
 * 识别只负责"把票面里有的字段读出来"，落地口径和开票一致：
 *   - 成本/收入按"开票方是不是我们自己"判断（先比税号，再比名称）；
 *   - 往来方优先按税号匹配档案，匹配不到退到名称，再匹配不到就把票面文本带出来并提示补档案；
 *   - 票面里没有的字段（记账日期、实收日期）留空，不猜值。
 *
 * 支持：中国增值税电子发票、数电票 XML、墨西哥 CFDI（XML / PDF）、
 * 新加坡 GST 商业发票、达创普通商业发票、香港万众商业发票（PDF / Excel，按约定无税规则）。
 * 扫描件、拍照件没有文字层，本期不处理（后续接 OCR）。
 */

export type RecognizedInvoiceForm = {
  type: "cost" | "income" | "";
  accountPeriod: string;
  accountingDate?: string;
  recognitionFacts?: Record<string, string>;
  invoiceNo: string;
  invoiceDate: string;
  /** 优先使用支持模板的票面到期日。 */
  receivableDate: string;
  currency: string;
  exchangeRate: string;
  invoiceTotal: string;
  taxRate: string;
  amountExcludingTax: string;
  taxAmount: string;
  companyEntityId: string;
  companyEntity: string;
  invoiceEntityId: string;
  invoiceEntity: string;
  invoiceEntityType: string;
  taxUuid: string;
};

export type InvoicePartyMatch = {
  status: "matched" | "ambiguous" | "unmatched" | "tax_conflict";
  via: "税号" | "名称" | null;
  id: string;
  name: string;
  paymentTermDays?: string;
  candidates: Array<{ id: string; name: string }>;
};

export type InvoiceRecognition = {
  facts?: {
    issuerName: string; issuerTaxNumber: string; receiverName: string; receiverTaxNumber: string;
    invoiceNo: string; invoiceDate: string; currency: string; exchangeRate: string;
    amountExcludingTax: string; taxRate: string; taxAmount: string; amountIncludingTax: string; taxUuid: string;
    dueDate?: string; paymentTermDays?: string; servicePeriod?: string; comment?: string;
  };
  partyFields?: InvoicePartyFields;
  lines?: HkwzInvoice["lines"];
  taxTreatment?: "template_no_tax";
  matches?: { issuerUnitId: string; receiverUnitId: string; issuerSupplierId: string; receiverCustomerId: string };
  partyMatches?: Record<"issuerUnit" | "receiverUnit" | "issuerSupplier" | "receiverCustomer", InvoicePartyMatch>;
  /** 识别来源：中国增值税电子发票 / 墨西哥 CFDI XML / 墨西哥 CFDI PDF */
  source: string;
  /** 票种说明，用于结果页展示 */
  kind: string;
  /** 结构化精确解析（XML 或票面原串） */
  exact: boolean;
  /** 逐字段识别明细，前端按"已识别 / 推导 / 未识别"展示 */
  fields: Array<{ key: string; label: string; value: string; status: "recognized" | "derived" | "missing" | "matched" }>;
  form: RecognizedInvoiceForm;
  warnings: string[];
};

type EntityRow = { id: string; taxNumber: string | null; names: string[]; paymentTermDays?: string };

function text(value: unknown) {
  return String(value ?? "").trim();
}

/** 比对用归一：去掉空格、标点、大小写差异（"LUZ NEWMEDIA, S.A. DE C.V." ↔ "LUZ NEWMEDIA"）。 */
function normalizeKey(value: unknown) {
  return text(value).normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function entityNames(row: Row) {
  return [row.name, row.nameCn, row.nameEn, row.shortName, row.entityName]
    .map((value) => text(value))
    .filter(Boolean);
}

async function loadEntities() {
  const [units, suppliers, customers] = await Promise.all([
    queryRows<Row>("SELECT undertakingUnitId AS id, name, nameCn, nameEn, shortName, entityName, taxNumber, paymentTermDays FROM merge_common_undertaking_units"),
    queryRows<Row>("SELECT supplierId AS id, nameCn AS name, nameEn, shortName, taxNumber FROM merge_common_suppliers"),
    queryRows<Row>("SELECT customerId AS id, name, nameCn, nameEn, shortName, taxNumber FROM merge_common_customers"),
  ]);
  const toEntities = (rows: Row[], unit = false): EntityRow[] => rows.map((row) => ({ id: text(row.id), taxNumber: text(row.taxNumber) || null, names: entityNames(row),
    ...(unit ? { paymentTermDays: String(defaultInvoicePaymentTermDays(row.paymentTermDays)) } : {}),
  }));
  return { units: toEntities(units, true), suppliers: toEntities(suppliers), customers: toEntities(customers) };
}

/**
 * 匹配档案：税号优先，其次名称（完全相等 → 包含）。
 * 名称包含只认长度 ≥4 的串，避免"XX"这种两字简称误命中。
 */
function matchEntity(list: EntityRow[], taxNumber: string, name: string) {
  const result = (candidates: EntityRow[], via: InvoicePartyMatch["via"], conflict = false) => ({
    entity: !conflict && candidates.length === 1 ? candidates[0] : null,
    via,
    status: conflict ? "tax_conflict" as const : candidates.length === 1 ? "matched" as const : candidates.length > 1 ? "ambiguous" as const : "unmatched" as const,
    candidates,
  });
  const tax = normalizeKey(taxNumber);
  if (tax) {
    const byTax = list.filter((entity) => entity.taxNumber && normalizeKey(entity.taxNumber) === tax);
    if (byTax.length) return result(byTax, "税号");
  }
  const target = normalizeKey(name);
  if (!target) return result([], null);
  const finishName = (candidates: EntityRow[]) => {
    const compatible = candidates.filter(entity => !tax || !entity.taxNumber || normalizeKey(entity.taxNumber) === tax);
    return compatible.length ? result(compatible, "名称") : result(candidates, "名称", true);
  };
  const exact = list.filter((entity) => entity.names.some((value) => normalizeKey(value) === target));
  if (exact.length) return finishName(exact);
  if (target.length >= 4) {
    const partial = list.filter((entity) => entity.names.some((value) => {
      const key = normalizeKey(value);
      return key.length >= 4 && (key.includes(target) || target.includes(key));
    }));
    if (partial.length) return finishName(partial);
  }
  return result([], null);
}

function describeMatch(match: ReturnType<typeof matchEntity>): InvoicePartyMatch {
  return {
    status: match.status, via: match.via, id: match.entity?.id ?? "",
    name: displayName(match.entity, ""),
    ...(match.entity?.paymentTermDays !== undefined ? { paymentTermDays: match.entity.paymentTermDays } : {}),
    candidates: match.candidates.map(entity => ({ id: entity.id, name: displayName(entity, entity.id) })),
  };
}

function displayName(entity: EntityRow | null, fallback: string) {
  if (!entity) return fallback;
  return entity.names[0] ?? fallback;
}

/** 发票币种 → 发票管理里的「发票汇率」（口径是 1 USD = X 本币）。 */
function defaultExchangeRate(currency: string, invoiceRate: string, project: { exchangeRateUsd: number; exchangeRateMxn: number }) {
  if (!currency || currency === "USD") return "1";
  if (currency === "MXN") {
    if (invoiceRate) return invoiceRate;
    return project.exchangeRateMxn > 0 ? String(Number((1 / project.exchangeRateMxn).toFixed(4))) : "";
  }
  if (currency === "CNY") return project.exchangeRateUsd > 0 ? String(project.exchangeRateUsd) : "";
  return invoiceRate || "";
}

function money(value: number | null) {
  return value === null ? "" : String(value);
}

function localDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 应收日期：开票日期 + 天数（默认 30 天，和开票弹层的默认账期一致）。 */
function addDays(dateOnly: string, days: number) {
  const base = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  return localDateOnly(new Date(base.getTime() + days * 86400000));
}

export async function recognizeInvoiceFile(params: {
  projectId?: string;
  direction?: "income" | "cost";
  fileName: string;
  bytes: Buffer;
  project?: { exchangeRateUsd: number; exchangeRateMxn: number };
}): Promise<InvoiceRecognition> {
  const fileName = text(params.fileName);
  const head = params.bytes.subarray(0, 5).toString("utf8");
  const isPdf = head.startsWith("%PDF");
  const isExcel = !isPdf && /\.(xlsx|xls)$/i.test(fileName);
  // OFD 本质是 zip（PK 开头）；个别环境只给扩展名，所以两个条件都认
  const isZip = params.bytes[0] === 0x50 && params.bytes[1] === 0x4b;
  const isOfd = !isPdf && !isExcel && (isZip || fileName.toLowerCase().endsWith(".ofd"));
  const rawText = isPdf || isOfd || isExcel ? "" : params.bytes.toString("utf8");
  const isXml = !isPdf && !isOfd && !isExcel && /^\s*</.test(rawText);
  if (!isPdf && !isOfd && !isXml && !isExcel) throw new Error("只支持 PDF / Excel（XLSX、XLS）/ OFD / XML 发票（照片、扫描件请等 OCR 版本）");

  const entities = await loadEntities();
  const warnings: string[] = [];
  let source = "";
  let kind = "";
  let exact = false;
  let hkwz: HkwzInvoice | undefined;
  let parsed: {
    fullNumber: string; uuid: string; invoiceDate: string;
    issuerName: string; issuerTaxNumber: string; receiverName: string; receiverTaxNumber: string;
    currency: string; exchangeRate: string;
    amountExcludingTax: number | null; taxAmount: number | null; totalIncludingTax: number | null; taxRate: number | null;
  };

  /** 中国票（PDF 文字层 / OFD 版式文件 / 数电票 XML）走同一套字段映射。 */
  const fromChinaInvoice = (vat: ChinaVatInvoice) => ({
    fullNumber: vat.invoiceNo, uuid: "", invoiceDate: vat.invoiceDate,
    issuerName: vat.sellerName, issuerTaxNumber: vat.sellerTaxNumber,
    receiverName: vat.buyerName, receiverTaxNumber: vat.buyerTaxNumber,
    currency: vat.currency, exchangeRate: "",
    amountExcludingTax: vat.amountExcludingTax, taxAmount: vat.taxAmount,
    totalIncludingTax: vat.totalIncludingTax, taxRate: vat.taxRate,
  });

  const fromHkwzInvoice = (invoice: HkwzInvoice) => ({
    fullNumber: invoice.invoiceNo, uuid: "", invoiceDate: invoice.invoiceDate,
    issuerName: invoice.issuerName, issuerTaxNumber: "", receiverName: invoice.receiverName, receiverTaxNumber: "",
    currency: invoice.currency, exchangeRate: invoice.currency === "USD" ? "1" : "",
    amountExcludingTax: invoice.total, taxAmount: 0, totalIncludingTax: invoice.total, taxRate: 0,
  });

  if (isExcel) {
    hkwz = parseHkwzWorkbook(params.bytes);
    source = "香港万众商业发票 Excel"; kind = "商业发票（按模板无税规则）"; exact = true;
    parsed = fromHkwzInvoice(hkwz);
  } else if (isOfd) {
    const content = extractOfdPages(params.bytes).join("\n");
    if (!content.trim()) throw new Error("这个 OFD 里没有文字层（可能是扫描件转的），本期识别不了");
    const vat = parseChinaVatInvoice(content);
    source = "中国增值税电子发票 OFD";
    kind = vat.kind || "增值税电子发票";
    exact = true;
    parsed = fromChinaInvoice(vat);
    if (vat.taxExempt) warnings.push("这张是免税发票，税额按 0 填入");
  } else if (isXml && !/cfdi:|Comprobante/i.test(rawText)) {
    const vat = parseChinaEinvoiceXml(rawText);
    source = "中国数电票 XML";
    kind = vat.kind;
    exact = true;
    parsed = fromChinaInvoice(vat);
    if (vat.taxExempt) warnings.push("这张是免税发票，税额按 0 填入");
  } else if (isXml) {
    const xml = parseCfdiInvoice(rawText);
    source = "墨西哥 CFDI XML";
    kind = `CFDI ${xml.version}`;
    exact = true;
    parsed = {
      fullNumber: xml.fullNumber,
      uuid: xml.uuid,
      invoiceDate: xml.issuedAt.slice(0, 10),
      issuerName: xml.issuer.name, issuerTaxNumber: xml.issuer.rfc,
      receiverName: xml.receiver.name, receiverTaxNumber: xml.receiver.rfc,
      currency: xml.currency || "USD",
      exchangeRate: xml.exchangeRate ? String(xml.exchangeRate) : "",
      amountExcludingTax: xml.subtotal,
      taxAmount: xml.transferredTaxTotal,
      totalIncludingTax: xml.total,
      taxRate: xml.taxRate,
    };
  } else {
    const pages = await extractPdfLayoutPages(params.bytes);
    const content = pages.map(page => page.text).join("\n");
    if (!content.trim()) throw new Error("这个 PDF 没有文字层（可能是扫描件），本期识别不了");
    const isSingapore = isSingaporeInvoiceText(content);
    const isDazhuangCommercial = isDazhuangCommercialInvoiceText(content);
    const isCfdi = /CFDI|FACTURA|Comprobante|Folio Fiscal/.test(content) && !/发票号码/.test(content);
    if (isHkwzInvoiceText(content)) {
      hkwz = parseHkwzInvoice(hkwzPdfRows(pages));
      source = "香港万众商业发票 PDF"; kind = "商业发票（按模板无税规则）"; exact = true;
      parsed = fromHkwzInvoice(hkwz);
    } else if (isSingapore) {
      const sg = parseSingaporeInvoiceText(content);
      source = "新加坡商业发票";
      kind = `GST ${sg.gstRate ?? 0}%`;
      exact = true;
      parsed = {
        fullNumber: sg.invoiceNo,
        uuid: "",
        invoiceDate: sg.invoiceDate,
        issuerName: sg.supplierName,
        issuerTaxNumber: sg.supplierGstRegNo,
        receiverName: sg.customerName,
        receiverTaxNumber: "",
        currency: sg.currency,
        exchangeRate: sg.currency === "USD" ? "1" : "",
        amountExcludingTax: sg.subtotal,
        taxAmount: sg.gstAmount,
        totalIncludingTax: sg.total,
        taxRate: sg.gstRate,
      };
    } else if (isDazhuangCommercial) {
      const commercial = parseDazhuangCommercialInvoiceText(content);
      source = "达创普通商业发票";
      kind = "商业发票（票面未列明税额）";
      exact = true;
      parsed = {
        fullNumber: commercial.invoiceNo,
        uuid: "",
        invoiceDate: commercial.invoiceDate,
        issuerName: commercial.issuerName,
        issuerTaxNumber: "",
        receiverName: commercial.receiverName,
        receiverTaxNumber: "",
        currency: commercial.currency,
        exchangeRate: "",
        amountExcludingTax: commercial.amountExcludingTax,
        taxAmount: commercial.taxAmount,
        totalIncludingTax: commercial.totalIncludingTax,
        taxRate: commercial.taxRate,
      };
      warnings.push("该商业发票票面未列明未税金额、税率和税金，请人工确认后补充");
    } else if (isCfdi) {
      const cfdi = parseCfdiInvoiceText(content);
      source = "墨西哥 CFDI PDF";
      kind = `CFDI ${cfdi.version}`;
      exact = cfdi.exact;
      parsed = {
        fullNumber: cfdi.fullNumber, uuid: cfdi.uuid, invoiceDate: cfdi.invoiceDate,
        issuerName: cfdi.issuerName, issuerTaxNumber: cfdi.issuerTaxNumber,
        receiverName: cfdi.receiverName, receiverTaxNumber: cfdi.receiverTaxNumber,
        currency: cfdi.currency, exchangeRate: cfdi.exchangeRate,
        amountExcludingTax: cfdi.amountExcludingTax, taxAmount: cfdi.taxAmount,
        totalIncludingTax: cfdi.totalIncludingTax, taxRate: cfdi.taxRate,
      };
      if (!cfdi.exact) warnings.push("这张 PDF 没有票面原串，字段是按模板标签读取的，请重点核对");
    } else {
      const vat = parseChinaVatInvoice(content);
      source = "中国增值税电子发票";
      kind = vat.kind || "增值税电子发票";
      exact = true;
      parsed = fromChinaInvoice(vat);
      if (vat.taxExempt) warnings.push("这张是免税发票，税额按 0 填入");
    }
  }

  if (hkwz) warnings.push("此模板按已确认的无税规则处理：未税金额等于总额，税率和税金为 0", ...hkwz.warnings);

  // 开票方是我们 → 收入；收票方是我们 → 成本
  const issuerMatch = matchEntity(entities.units, parsed.issuerTaxNumber, parsed.issuerName);
  const receiverMatch = matchEntity(entities.units, parsed.receiverTaxNumber, parsed.receiverName);
  const supplierMatch = matchEntity(entities.suppliers, parsed.issuerTaxNumber, parsed.issuerName);
  const customerMatch = matchEntity(entities.customers, parsed.receiverTaxNumber, parsed.receiverName);
  const detectedType = issuerMatch.entity && !receiverMatch.entity ? "income" : receiverMatch.entity && !issuerMatch.entity ? "cost" : "";
  const type = params.direction ?? detectedType;
  if (!detectedType) warnings.push("购销双方未能唯一确定我方主体，请选择本地档案并确认发票方向");
  if (params.direction && detectedType && params.direction !== detectedType) warnings.push("票面购销方向与当前业务不一致，请核对原件和业务单据");
  const ourMatch = type === "income" ? issuerMatch : receiverMatch;
  const counterpartName = type === "income" ? parsed.receiverName : parsed.issuerName;
  const counterpartMatch = type === "income" ? customerMatch : supplierMatch;
  const warnMatch = (label: string, match: ReturnType<typeof matchEntity>, name: string) => {
    if (match.status === "ambiguous") warnings.push(`${label}匹配到 ${match.candidates.length} 条档案（${match.via}重复，票面：${name}），请手工选择`);
    else if (match.status === "tax_conflict") warnings.push(`${label}名称匹配但税号与档案不一致（票面：${name}），请核对后手工选择`);
    else if (!match.entity) warnings.push(`${label}未匹配到档案（票面：${name || "未识别"}），请手工选择或补充档案`);
  };
  warnMatch("承接单位", ourMatch, type === "income" ? parsed.issuerName : parsed.receiverName);
  if (ourMatch.entity && ourMatch.via === "名称") warnings.push(`承接单位「${displayName(ourMatch.entity, "")}」是按名称匹配的，建议补税号`);
  warnMatch(type === "income" ? "客户" : "供应商", counterpartMatch, counterpartName);

  // 同项目里已经录过的票直接提示，避免"传两次多出一行"
  const existing = params.projectId ? await queryRows<Row>(
    "SELECT invoiceNo, taxUuid FROM merge_po_settlement_invoices WHERE projectId = :projectId",
    { projectId: params.projectId },
  ).catch(() => [] as Row[]) : [];
  if (parsed.uuid && existing.some((row) => text(row.taxUuid) === parsed.uuid)) {
    warnings.push("这张发票已经录过了，保存会被拦下");
  } else if (parsed.fullNumber && existing.some((row) => text(row.invoiceNo) === parsed.fullNumber)) {
    warnings.push(`发票号 ${parsed.fullNumber} 在本项目已经录过，确认不是重复上传`);
  }

  const currency = parsed.currency || "CNY";
  const exchangeRate = defaultExchangeRate(currency, parsed.exchangeRate, params.project ?? { exchangeRateUsd: 0, exchangeRateMxn: 0 });
  const form: RecognizedInvoiceForm = {
    type,
    // 按业务口径：账期直接取开票日期
    accountPeriod: parsed.invoiceDate,
    invoiceNo: parsed.fullNumber,
    invoiceDate: parsed.invoiceDate,
    receivableDate: hkwz?.dueDate || (parsed.invoiceDate ? addDays(parsed.invoiceDate, 30) : ""),
    currency,
    exchangeRate,
    invoiceTotal: money(parsed.totalIncludingTax),
    taxRate: parsed.taxRate === null ? "" : String(parsed.taxRate),
    amountExcludingTax: money(parsed.amountExcludingTax),
    taxAmount: money(parsed.taxAmount),
    companyEntityId: ourMatch.entity?.id ?? "",
    companyEntity: displayName(ourMatch.entity, type === "income" ? parsed.issuerName : parsed.receiverName),
    invoiceEntityId: counterpartMatch.entity?.id ?? "",
    invoiceEntity: displayName(counterpartMatch.entity, counterpartName),
    invoiceEntityType: type === "income" ? "customer" : "supplier",
    taxUuid: parsed.uuid,
  };

  const fields: InvoiceRecognition["fields"] = [
    { key: "type", label: "类型", value: type === "income" ? "收入" : type === "cost" ? "成本" : "", status: type ? "derived" : "missing" },
    { key: "companyEntity", label: "承接单位", value: form.companyEntity, status: ourMatch.entity ? (ourMatch.via === "税号" ? "matched" : "recognized") : "missing" },
    { key: "invoiceEntity", label: "供应商/客户", value: form.invoiceEntity, status: counterpartMatch.entity ? (counterpartMatch.via === "税号" ? "matched" : "recognized") : "missing" },
    { key: "invoiceNo", label: "发票号", value: form.invoiceNo, status: form.invoiceNo ? "recognized" : "missing" },
    { key: "invoiceDate", label: "发票日期", value: form.invoiceDate, status: form.invoiceDate ? "recognized" : "missing" },
    { key: "currency", label: "币种 / 汇率", value: `${form.currency}${form.exchangeRate ? ` · ${form.exchangeRate}` : ""}`, status: form.exchangeRate ? "recognized" : "missing" },
    { key: "invoiceTotal", label: "发票总额（含税）", value: form.invoiceTotal, status: form.invoiceTotal ? "recognized" : "missing" },
    { key: "amountExcludingTax", label: "不含税金额", value: form.amountExcludingTax, status: form.amountExcludingTax ? "recognized" : "missing" },
    { key: "taxRate", label: "税率 / 税金", value: `${form.taxRate || "-"}% · ${form.taxAmount || "-"}`, status: form.taxRate ? "recognized" : "missing" },
    { key: "accountPeriod", label: "账期", value: form.accountPeriod, status: form.accountPeriod ? "derived" : "missing" },
    { key: "receivableDate", label: "应收日期", value: form.receivableDate, status: form.receivableDate ? "derived" : "missing" },
    { key: "accountingDate", label: "财务记账日期", value: "", status: "missing" },
    { key: "actualReceiptDate", label: "实收/实付日期", value: "", status: "missing" },
  ];
  if (!form.invoiceNo) warnings.push("没读到发票号，请手工填写");
  if (!form.invoiceTotal) warnings.push("没读到发票总额，请手工填写");
  if (hkwz) {
    for (const field of fields) {
      if (["amountExcludingTax", "taxRate"].includes(field.key)) field.status = "derived";
      if (field.key === "receivableDate" && hkwz.dueDate) field.status = "recognized";
    }
    fields.push({ key: "servicePeriod", label: "票面服务月份", value: hkwz.servicePeriod, status: hkwz.servicePeriod ? "recognized" : "missing" });
  }

  return {
    source, kind, exact, fields, form, warnings,
    ...(hkwz ? { partyFields: hkwz.partyFields, lines: hkwz.lines, taxTreatment: "template_no_tax" as const } : {}),
    facts: {
      issuerName: parsed.issuerName, issuerTaxNumber: parsed.issuerTaxNumber,
      receiverName: parsed.receiverName, receiverTaxNumber: parsed.receiverTaxNumber,
      invoiceNo: parsed.fullNumber, invoiceDate: parsed.invoiceDate, currency: parsed.currency,
      exchangeRate: parsed.exchangeRate, amountExcludingTax: money(parsed.amountExcludingTax),
      taxRate: money(parsed.taxRate), taxAmount: money(parsed.taxAmount), amountIncludingTax: money(parsed.totalIncludingTax), taxUuid: parsed.uuid,
      ...(hkwz ? { dueDate: hkwz.dueDate, paymentTermDays: hkwz.paymentTermDays, servicePeriod: hkwz.servicePeriod, comment: hkwz.comment } : {}),
    },
    matches: {
      issuerUnitId: issuerMatch.entity?.id ?? "", receiverUnitId: receiverMatch.entity?.id ?? "",
      issuerSupplierId: supplierMatch.entity?.id ?? "",
      receiverCustomerId: customerMatch.entity?.id ?? "",
    },
    partyMatches: {
      issuerUnit: describeMatch(issuerMatch), receiverUnit: describeMatch(receiverMatch),
      issuerSupplier: describeMatch(supplierMatch), receiverCustomer: describeMatch(customerMatch),
    },
  };
}
