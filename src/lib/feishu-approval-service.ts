/**
 * 飞书审批开票（Cloud invoicing process）。
 *
 * 与「本地直接开票」并存：本地开票点一下即出票；飞书审批开票必须走完审批才出票，
 * 没有跳过审批的口子。巴西主体不走飞书，直接走本地开票。
 *
 * 应用身份即可发起（实测通过）：用 tenant_access_token 调
 *   POST /open-apis/approval/v4/instances     发起实例（发起人用 open_id 指定）
 *   GET  /open-apis/approval/v4/instances/{c} 查实例状态
 * 回写先做轮询，事件订阅后续再补。
 *
 * 依赖飞书权限：approval:approval（已开通）。附件字段还需要 drive:file:upload，
 * 未开通时附件相关的分支会在提交前被拦下并给出提示。
 */
import { execute, queryRows, type Row } from "./db";
import { randomUUID } from "node:crypto";
import { FEISHU_API_BASE } from "./feishu-auth-config";
import { getFeishuTenantAccessToken } from "./feishu-message-service";
import { buildInvoicePrefill, resolveInvoiceParties, type InvoiceSourceType } from "./invoice-service";
import { readFile as readStoredFile } from "./file-storage-service";
import { parseCfdiInvoice, verifyInvoiceAgainstExpectation, type CfdiInvoice, type InvoiceVerificationIssue } from "./cfdi-invoice-parser";
import { listCloudAttachments, storeCloudAttachment } from "./cloud-service";

/** 「Cloud invoicing process」的审批定义 code。可用 FEISHU_INVOICE_APPROVAL_CODE 覆盖。 */
const DEFAULT_INVOICE_APPROVAL_CODE = "ABBC8240-2CA4-4A33-8E58-AC91FC8648F2";

export function getInvoiceApprovalCode() {
  return (process.env.FEISHU_INVOICE_APPROVAL_CODE ?? "").trim() || DEFAULT_INVOICE_APPROVAL_CODE;
}

/**
 * 审批表单字段 id（取自审批定义，改定义时要同步这里）。
 * 字段名与飞书后台一致，方便对照。
 */
export const APPROVAL_FIELDS = {
  purpose: "widget17634570920130001",
  companyName: "widget17634571084590001",
  chileNote: "widget17688908865480001",
  chileInvoiceInfo: "widget17688899715190001",
  chileInvoiceType: "widget17688900344790001",
  chileAmount: "widget17688903992060001",
  chileNote1: "widget17688901177870001",
  chileNote2: "widget17688902385280001",
  chileNote3: "widget17688903140710001",
  chileNote4: "widget17688903750470001",
  customerInfo: "widget17634575042790001",
  customerName: "widget17634573580350001",
  taxId: "widget17634573920030001",
  taxRegime: "widget17634574139260001",
  paymentMethod: "widget17782047616400001",
  address: "widget17634576495410001",
  postCode: "widget17634576525850001",
  invoiceInfo: "widget17634576967120001",
  amountIncludingTax: "widget17634577022660001",
  invoiceContent: "widget17634578563930001",
  cfdiCode: "widget17634579091810001",
  paymentReceivedTime: "widget17883246305410001",
  customerCfs: "widget17634579804280001",
} as const;

/** Company Name 选项（key 取自审批定义）。 */
export const COMPANY_OPTIONS = {
  newmedia: { key: "mi4ctxbf-mgwdd2vt9f9-0", text: "LUZ NEWMEDIA, S.A. DE. C.V." },
  brazil: { key: "mi4ctxbf-d0tibl1ctcu-0", text: "LUZ BRAZIL LTDA" },
  technology: { key: "mi4ctxbf-4hy7ihf0wgi-0", text: "LUZ TECHNOLOGY SpA" },
  jixun: { key: "miwxwtzf-dn9lhlv8pw-1", text: "Jixun Technologies de Mexico" },
} as const;

/** 墨西哥：付款方式（开票时由用户选择）。 */
export const PAYMENT_METHOD_OPTIONS = {
  PUE: { key: "mow97bc8-9eqc39v1b1o-0", text: "PUE - 一次性付清 / 现结" },
  PPD: { key: "mow97bc8-qn5q5v16mt-0", text: "PPD - 分期付款  / 延后付款" },
} as const;

/** 墨西哥：CFDI 用途码。 */
export const CFDI_OPTIONS = {
  G01: { key: "mi4db35p-e93meoj0m7-0", text: "G01 Adquisición de mercancías" },
  G03: { key: "mi4db35p-rmgnby64d2d-0", text: "G03 Gastos en general" },
} as const;

/** 智利：发票类型。 */
export const CHILE_INVOICE_TYPE_OPTIONS = {
  prepayment: { key: "mkm7gdv3-5wjtlhnc8l6-0", text: "Computer Service Prepayment" },
  service: { key: "mkm7gdv3-hfkup370vjr-0", text: "Computer Service" },
} as const;

/** 智利：Notes on the invoice 2。 */
export const CHILE_NOTE2_OPTIONS = {
  prepayment: { key: "mkm7krb5-qw2flcupzbg-0", text: "Prepayment for Computing Power Service" },
  service: { key: "mkm7krb5-9ubru5rr8f-0", text: "Computing Power Service" },
} as const;

export type InvoiceApprovalBranch = "mx" | "cl" | "br";

/**
 * 承接单位 → 审批主体。
 * 先按承接单位编码，再按名称关键词兜底；Jixun 目前不在承接单位档案里，
 * 遇到时会命中关键词分支（需要时把它建档并补一行到 CODE 映射即可）。
 */
const COMPANY_BY_UNIT_CODE: Record<string, { branch: InvoiceApprovalBranch; option: keyof typeof COMPANY_OPTIONS }> = {
  MXGS01: { branch: "mx", option: "newmedia" },
  CLGS01: { branch: "cl", option: "technology" },
  BRGS01: { branch: "br", option: "brazil" },
};

export function resolveInvoiceApprovalParty(input: { undertakingUnitCode?: string; undertakingUnitName?: string }) {
  const code = String(input.undertakingUnitCode ?? "").trim().toUpperCase();
  if (COMPANY_BY_UNIT_CODE[code]) {
    const matched = COMPANY_BY_UNIT_CODE[code];
    return { branch: matched.branch, optionKey: COMPANY_OPTIONS[matched.option].key, companyText: COMPANY_OPTIONS[matched.option].text };
  }
  const name = String(input.undertakingUnitName ?? "").toUpperCase();
  if (name.includes("JIXUN")) return { branch: "mx" as const, optionKey: COMPANY_OPTIONS.jixun.key, companyText: COMPANY_OPTIONS.jixun.text };
  if (name.includes("NEWMEDIA")) return { branch: "mx" as const, optionKey: COMPANY_OPTIONS.newmedia.key, companyText: COMPANY_OPTIONS.newmedia.text };
  if (name.includes("BRAZIL")) return { branch: "br" as const, optionKey: COMPANY_OPTIONS.brazil.key, companyText: COMPANY_OPTIONS.brazil.text };
  if (name.includes("TECHNOLOGY")) return { branch: "cl" as const, optionKey: COMPANY_OPTIONS.technology.key, companyText: COMPANY_OPTIONS.technology.text };
  return null;
}

export type InvoiceApprovalFormItem = { id: string; type: string; value: unknown; currency?: string };

/**
 * 日期控件的值必须是 **RFC3339**（官方文档「审批实例表单控件参数 - 日期」），
 * 传 `YYYY-MM-DD` 会被飞书判成「控件值不合法或者为空」（1395006）。
 *
 * 时区固定东八区：审批租户时区就是 +08:00（历史审批单里存的是 `...T00:00:00+08:00`），
 * 用同一个时区才能保证飞书里看到的日期跟用户填的同一天。
 */
export function toApprovalDateValue(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error("请填写约定收款日（格式 YYYY-MM-DD）");
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`;
}

export type InvoiceApprovalFormInput = {
  branch: InvoiceApprovalBranch;
  companyOptionKey: string;
  /** Purpose：账期 + 客户 + 项目/批次 */
  purpose: string;
  /** 约定收款日 YYYY-MM-DD */
  paymentReceivedTime: string;
  /** 金额控件的币种：墨西哥 MXN/USD，智利固定 CLP */
  amountCurrency: string;
  /** 墨西哥分支 */
  mexico?: {
    customerName: string;
    taxId: string;
    taxRegime: string;
    paymentMethodKey: string;
    address: string;
    postCode: string;
    amountIncludingTax: number;
    invoiceContent: string;
    cfdiCodeKey: string;
    /** CSF 附件（已上传到飞书得到的 file_token） */
    cfsFileTokens: string[];
  };
  /** 智利分支（预计先由人工填写） */
  chile?: {
    customerLabel: string;
    invoiceTypeKey: string;
    amountIncludingTax: number;
    note1: string;
    note2Key: string;
    note3: number;
    note4: number;
  };
};

/**
 * 组装提交给飞书的表单 JSON。
 *
 * 飞书的规则：单选（radioV2）传选项 key；金额传数字；日期传 YYYY-MM-DD；
 * 附件（attachmentV2）传文件 token 数组；分组字段（fieldList）传二维数组。
 * 只带当前分支要用的字段，未显示的字段飞书会按默认值处理。
 */
export function buildInvoiceApprovalForm(input: InvoiceApprovalFormInput): InvoiceApprovalFormItem[] {
  const fields: InvoiceApprovalFormItem[] = [
    { id: APPROVAL_FIELDS.purpose, type: "textarea", value: input.purpose },
    { id: APPROVAL_FIELDS.companyName, type: "radioV2", value: input.companyOptionKey },
    { id: APPROVAL_FIELDS.paymentReceivedTime, type: "date", value: toApprovalDateValue(input.paymentReceivedTime) },
  ];

  if (input.branch === "mx") {
    const mexico = input.mexico;
    if (!mexico) throw new Error("墨西哥分支缺少客户开票信息");
    if (!mexico.cfsFileTokens.length) throw new Error("墨西哥分支必须上传客户 CSF 附件");
    fields.push(
      {
        id: APPROVAL_FIELDS.customerInfo,
        type: "fieldList",
        value: [[
          { id: APPROVAL_FIELDS.customerName, type: "input", value: mexico.customerName },
          { id: APPROVAL_FIELDS.taxId, type: "input", value: mexico.taxId },
          { id: APPROVAL_FIELDS.taxRegime, type: "input", value: mexico.taxRegime },
          { id: APPROVAL_FIELDS.paymentMethod, type: "radioV2", value: mexico.paymentMethodKey },
          { id: APPROVAL_FIELDS.address, type: "input", value: mexico.address },
          { id: APPROVAL_FIELDS.postCode, type: "input", value: mexico.postCode },
        ]],
      },
      {
        id: APPROVAL_FIELDS.invoiceInfo,
        type: "fieldList",
        value: [[
          { id: APPROVAL_FIELDS.amountIncludingTax, type: "amount", value: mexico.amountIncludingTax, currency: input.amountCurrency },
          { id: APPROVAL_FIELDS.invoiceContent, type: "input", value: mexico.invoiceContent },
          { id: APPROVAL_FIELDS.cfdiCode, type: "radioV2", value: mexico.cfdiCodeKey },
        ]],
      },
      { id: APPROVAL_FIELDS.customerCfs, type: "attachmentV2", value: mexico.cfsFileTokens },
    );
  }

  if (input.branch === "cl") {
    const chile = input.chile;
    if (!chile) throw new Error("智利分支缺少发票信息");
    fields.push(
      {
        id: APPROVAL_FIELDS.chileInvoiceInfo,
        type: "fieldList",
        value: [[
          { id: APPROVAL_FIELDS.chileInvoiceType, type: "radioV2", value: chile.invoiceTypeKey },
          { id: APPROVAL_FIELDS.chileAmount, type: "amount", value: chile.amountIncludingTax, currency: input.amountCurrency },
          { id: APPROVAL_FIELDS.chileNote1, type: "input", value: chile.note1 },
          { id: APPROVAL_FIELDS.chileNote2, type: "radioV2", value: chile.note2Key },
          { id: APPROVAL_FIELDS.chileNote3, type: "number", value: chile.note3 },
          { id: APPROVAL_FIELDS.chileNote4, type: "number", value: chile.note4 },
        ]],
      },
    );
  }

  return fields;
}

/**
 * 金额控件的币种只认审批定义里配的范围：墨西哥是 MXN / USD，智利固定 CLP。
 * 来源账单是 MXN 就用 MXN，其余（含空值）按 USD —— 这两种之外的币种飞书会拒绝。
 */
export const APPROVAL_AMOUNT_CURRENCIES = { mx: ["MXN", "USD"], cl: ["CLP"] } as const;

export function resolveApprovalAmountCurrency(branch: InvoiceApprovalBranch, currency: unknown) {
  if (branch === "cl") return "CLP";
  return String(currency ?? "").trim().toUpperCase() === "MXN" ? "MXN" : "USD";
}

/* --------------------------------------------------------------------------
 * 飞书接口
 * ------------------------------------------------------------------------ */

type FeishuEnvelope<T> = { code?: number; msg?: string; data?: T };

async function callFeishu<T>(path: string, init: RequestInit = {}, action = "调用飞书接口"): Promise<T> {
  const token = await getFeishuTenantAccessToken();
  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as FeishuEnvelope<T> & { error?: { log_id?: string } };
  if (body.code !== 0) {
    const logId = body.error?.log_id ? `（log_id ${body.error.log_id}）` : "";
    throw new Error(`${action}失败（${String(body.code)}）：${body.msg ?? response.status}${logId}`);
  }
  return body.data as T;
}

/** 发起审批实例，返回 instance_code。 */
export async function createInvoiceApprovalInstance(input: {
  starterOpenId: string;
  form: InvoiceApprovalFormItem[];
  approvalCode?: string;
}) {
  const openId = String(input.starterOpenId ?? "").trim();
  if (!openId.startsWith("ou_")) throw new Error("发起人缺少飞书 open_id，无法以本人身份发起审批");
  const data = await callFeishu<{ instance_code?: string }>(
    "/open-apis/approval/v4/instances",
    {
      method: "POST",
      body: JSON.stringify({
        approval_code: input.approvalCode ?? getInvoiceApprovalCode(),
        open_id: openId,
        form: JSON.stringify(input.form),
      }),
    },
    "发起飞书审批",
  );
  const instanceCode = String(data?.instance_code ?? "").trim();
  if (!instanceCode) throw new Error("飞书未返回审批实例 code");
  return { instanceCode };
}

export type FeishuApprovalInstanceStatus = "pending" | "approved" | "rejected" | "canceled";

/** 查审批实例：状态 + 单号 + 驳回原因。 */
export async function fetchInvoiceApprovalInstance(instanceCode: string) {
  const data = await callFeishu<{
    status?: string;
    serial_number?: string;
    end_time?: string;
    task_list?: Array<Record<string, unknown>>;
    timeline?: Array<Record<string, unknown>>;
  }>(`/open-apis/approval/v4/instances/${encodeURIComponent(instanceCode)}`, {}, "查询飞书审批");

  const remoteStatus = String(data?.status ?? "").toUpperCase();
  const status: FeishuApprovalInstanceStatus = remoteStatus === "APPROVED" ? "approved"
    : remoteStatus === "REJECTED" ? "rejected"
      : remoteStatus === "CANCELED" || remoteStatus === "CANCELLED" || remoteStatus === "DELETED" ? "canceled"
        : "pending";

  let rejectReason = "";
  for (const entry of [...(data?.task_list ?? []), ...(data?.timeline ?? [])]) {
    const type = String(entry.type ?? "").toUpperCase();
    if (!["REJECT", "RECALL", "CANCEL"].includes(type)) continue;
    const comment = String((entry as { comment?: string }).comment ?? "").trim();
    const ext = String((entry as { ext?: string }).ext ?? "").trim();
    let extComment = "";
    if (ext.startsWith("{")) {
      try { extComment = String((JSON.parse(ext) as { comment?: string }).comment ?? "").trim(); } catch { extComment = ""; }
    }
    rejectReason = comment || extComment || rejectReason;
  }

  const endTime = Number(data?.end_time ?? 0);
  return {
    status,
    remoteStatus,
    serialNumber: String(data?.serial_number ?? "").trim(),
    finishedAt: endTime > 0 ? new Date(endTime) : null,
    rejectReason: rejectReason.slice(0, 500),
  };
}

/* --------------------------------------------------------------------------
 * 台账
 * ------------------------------------------------------------------------ */

export type InvoiceApprovalOwnerType = "cloud_row" | "billing_statement" | "service_fee" | "settlement_invoice";

export type SubmitInvoiceApprovalInput = {
  ownerType: InvoiceApprovalOwnerType;
  ownerId: string;
  /** 合并多账期时勾选的账单行 ID（含主行），通过后按这批行出票 */
  allocationSourceIds?: string[];
  ownerNo?: string;
  period?: string;
  starterOpenId: string;
  starterUserId?: string;
  starterName?: string;
  invoiceId?: string | null;
  form: InvoiceApprovalFormItem[];
  title?: string;
};

/**
 * 发起飞书审批并登记台账。
 * 返回台账 ID 与审批单号，调用方据此把来源单据置为「审批中」。
 */
export async function submitInvoiceApproval(input: SubmitInvoiceApprovalInput) {
  const approvalCode = getInvoiceApprovalCode();
  const { instanceCode } = await createInvoiceApprovalInstance({
    starterOpenId: input.starterOpenId,
    form: input.form,
    approvalCode,
  });

  const id = `FA-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await execute(
    `
      INSERT INTO merge_common_feishu_approvals
        (id, ownerType, ownerId, ownerNo, period, approvalCode, instanceCode, title, allocationSourceIds,
         status, starterOpenId, starterUserId, starterName, invoiceId, formJson, submittedAt, lastSyncedAt)
      VALUES
        (:id, :ownerType, :ownerId, :ownerNo, :period, :approvalCode, :instanceCode, :title, :allocationSourceIds,
         'pending', :starterOpenId, :starterUserId, :starterName, :invoiceId, :formJson, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    {
      id,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ownerNo: input.ownerNo ?? "",
      period: input.period ?? "",
      approvalCode,
      instanceCode,
      title: (input.title ?? "").slice(0, 255),
      allocationSourceIds: (input.allocationSourceIds ?? []).join(",").slice(0, 500),
      starterOpenId: input.starterOpenId,
      starterUserId: input.starterUserId ?? "",
      starterName: input.starterName ?? "",
      invoiceId: input.invoiceId ?? null,
      formJson: JSON.stringify(input.form),
    },
  );

  if (input.invoiceId) {
    await execute(
      "UPDATE merge_common_invoices SET approvalInstanceCode = :instanceCode, approvalStatus = 'pending' WHERE id = :invoiceId",
      { instanceCode, invoiceId: input.invoiceId },
    );
  }

  return { id, instanceCode, approvalCode };
}

/**
 * 同步一条审批的状态。
 *
 * 状态变化会写回台账，并同步开票记录上的 approvalStatus；
 * 审批通过后：抓审批人回传的真实发票（PDF+XML），用真实发票信息登记本地开票记录。
 */
export async function syncInvoiceApproval(instanceCode: string) {
  const rows = await queryRows<Row>(
    "SELECT id, status, invoiceId FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1",
    { instanceCode },
  );
  const record = rows[0];
  if (!record) throw new Error(`未找到审批台账：${instanceCode}`);

  const remote = await fetchInvoiceApprovalInstance(instanceCode);
  const changed = String(record.status ?? "") !== remote.status;
  await execute(
    `
      UPDATE merge_common_feishu_approvals
      SET status = :status, remoteStatus = :remoteStatus, serialNumber = :serialNumber,
          rejectReason = :rejectReason, finishedAt = :finishedAt,
          lastSyncedAt = CURRENT_TIMESTAMP, syncError = ''
      WHERE instanceCode = :instanceCode
    `,
    {
      status: remote.status,
      remoteStatus: remote.remoteStatus,
      serialNumber: remote.serialNumber,
      rejectReason: remote.rejectReason,
      finishedAt: remote.finishedAt,
      instanceCode,
    },
  );

  let invoiceId = String(record.invoiceId ?? "");
  if (invoiceId && remote.status !== "approved") {
    await execute("UPDATE merge_common_invoices SET approvalStatus = :status WHERE id = :invoiceId", { status: remote.status, invoiceId });
  } else {
    await execute("UPDATE merge_common_invoices SET approvalStatus = :status WHERE approvalInstanceCode = :instanceCode", { status: remote.status, instanceCode });
  }

  /**
   * 审批通过后**不生成我方票面**：真正的税务发票是财务在外部开的，
   * 审批人会把 PDF+XML 回传在审批意见里。这里只做一件事 ——
   * 把回传的真实发票抓回来，用**真实发票信息**建立本地开票记录。
   */
  if (remote.status === "approved") {
    try {
      const applied = await applyApprovedInvoiceFiles(instanceCode);
      invoiceId = applied.invoiceId ?? "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await execute("UPDATE merge_common_feishu_approvals SET syncError = :message WHERE instanceCode = :instanceCode", {
        message: `回传发票处理失败：${message}`.slice(0, 500),
        instanceCode,
      });
      throw new Error(`审批已通过，但回传发票处理失败：${message}`);
    }
  }

  return { instanceCode, status: remote.status, changed, serialNumber: remote.serialNumber, rejectReason: remote.rejectReason, invoiceId };
}

/* --------------------------------------------------------------------------
 * 审批通过 → 按真实发票登记本地开票记录
 * ------------------------------------------------------------------------ */

const OWNER_TO_SOURCE_TYPE: Record<InvoiceApprovalOwnerType, InvoiceSourceType> = {
  cloud_row: "cloud_row",
  billing_statement: "billing_statement",
  service_fee: "service_fee",
  settlement_invoice: "settlement_invoice",
};

const SOURCE_TYPE_TO_OWNER: Record<string, InvoiceApprovalOwnerType> = {
  cloud_row: "cloud_row",
  billing_statement: "billing_statement",
  service_fee: "service_fee",
  settlement_invoice: "settlement_invoice",
};

/** 一条来源单据上最近一次还在生效的审批（审批中 / 已通过）。 */
export async function findActiveInvoiceApproval(sourceType: string, sourceId: string) {
  const ownerType = SOURCE_TYPE_TO_OWNER[String(sourceType)] ?? "cloud_row";
  const rows = await queryRows<{ instanceCode: string; status: string; serialNumber: string; rejectReason: string; submittedAt: string; invoiceId: string }>(
    `SELECT instanceCode, status, serialNumber, rejectReason, invoiceId, DATE_FORMAT(submittedAt, '%Y-%m-%d %H:%i') AS submittedAt
       FROM merge_common_feishu_approvals
      WHERE ownerType = :ownerType AND ownerId = :ownerId AND status IN ('pending', 'approved')
      ORDER BY submittedAt DESC LIMIT 1`,
    { ownerType, ownerId: sourceId },
  );
  return rows[0] ?? null;
}

/**
 * 批量取「华为云对账行 → 飞书审批状态」，供列表展示用。
 * 只返回还在生效的审批（审批中 / 已通过），驳回和撤回不显示在列上。
 */
export async function loadInvoiceApprovalMap(sourceIds: string[]) {
  const ids = Array.from(new Set(sourceIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  const map = new Map<string, { status: string; serialNumber: string; instanceCode: string; submittedAt: string; rejectReason: string }>();
  if (!ids.length) return map;
  const rows = await queryRows<{ ownerId: string; status: string; serialNumber: string; instanceCode: string; submittedAt: string; rejectReason: string }>(
    `SELECT ownerId, status, serialNumber, instanceCode, rejectReason, DATE_FORMAT(submittedAt, '%Y-%m-%d %H:%i') AS submittedAt
       FROM merge_common_feishu_approvals
      WHERE ownerType = 'cloud_row' AND ownerId IN (:ids) AND status IN ('pending', 'approved')
      ORDER BY submittedAt ASC`,
    { ids },
  );
  for (const row of rows) map.set(String(row.ownerId), row);
  return map;
}

function readApprovalFormValue(fields: InvoiceApprovalFormItem[], id: string) {
  return fields.find((field) => field.id === id)?.value;
}

/**
 * 用审批回传的**真实发票信息**建立本地开票记录。
 *
 * 飞书审批路径**不生成我方票面**：票是财务在外部（税代系统）开的，
 * 审批人回传 PDF+XML 之后，本地开票记录的票号/金额/开票日期全部取真实发票的值。
 */
export async function createInvoiceFromCfdi(input: {
  instanceCode: string;
  ownerId: string;
  period: string;
  dueDate: string;
  comment: string;
  actor: { userId?: string; name?: string };
  cfdi: CfdiInvoice;
  sourceFile?: { fileName: string; fileType: string; fileSize: number; storageProvider: string; storageKey: string | null } | null;
}) {
  const { cfdi } = input;
  const rows = await queryRows<{ customerId: string; undertakingUnitId: string }>(
    "SELECT customerId, undertakingUnitId FROM merge_cloud_rows WHERE id = :id LIMIT 1",
    { id: input.ownerId },
  );
  const parties = await resolveInvoiceParties({
    customerId: String(rows[0]?.customerId ?? ""),
    undertakingUnitId: String(rows[0]?.undertakingUnitId ?? ""),
  });
  const id = randomUUID();
  const invoiceDate = cfdi.issuedAt.slice(0, 10);

  await execute(
    `INSERT INTO merge_common_invoices
       (id, invoiceNo, source, status, sourceType, sourceId, period,
        customerId, customerName, customerAddress, customerTaxNumber, customerContact, customerContactEmail,
        undertakingUnitId, sellerName, sellerCountry, sellerAddress, sellerTelephone, sellerFinanceEmail,
        bankAccountId, bankAccountName, bankName, bankAccount, bankSwiftCode, bankCode, bankAddress,
        currency, amountExcludingTax, taxRate, taxAmount, amountIncludingTax,
        invoiceDate, dueDate, comment,
        fileName, fileType, fileSize, fileProvider, storageKey, fileContent,
        issuedAt, issuedByName, remark, approvalInstanceCode, approvalStatus,
        cfdiUuid, cfdiFolio, cfdiTotalAmount, cfdiIssuedAt, cfdiCurrency, cfdiIssuerRfc, cfdiReceiverRfc,
        createdByName, updatedByName)
     VALUES
       (:id, :invoiceNo, 'external', 'issued', 'cloud_row', :sourceId, :period,
        :customerId, :customerName, :customerAddress, :customerTaxNumber, :customerContact, :customerContactEmail,
        :undertakingUnitId, :sellerName, :sellerCountry, :sellerAddress, :sellerTelephone, :sellerFinanceEmail,
        :bankAccountId, :bankAccountName, :bankName, :bankAccount, :bankSwiftCode, :bankCode, :bankAddress,
        :currency, :amountExcludingTax, :taxRate, :taxAmount, :amountIncludingTax,
        :invoiceDate, :dueDate, :comment,
        :fileName, :fileType, :fileSize, :fileProvider, :storageKey, NULL,
        NOW(), :actorName, '飞书审批回传的真实发票', :instanceCode, 'approved',
        :cfdiUuid, :cfdiFolio, :cfdiTotalAmount, :cfdiIssuedAt, :cfdiCurrency, :cfdiIssuerRfc, :cfdiReceiverRfc,
        :actorName, :actorName)`,
    {
      id,
      invoiceNo: cfdi.fullNumber || cfdi.uuid.slice(0, 8),
      sourceId: input.ownerId,
      period: input.period || null,
      customerId: parties.customerId || null,
      customerName: parties.customerName,
      customerAddress: parties.customerAddress,
      customerTaxNumber: cfdi.receiver.rfc || parties.customerTaxNumber,
      customerContact: parties.customerContact,
      customerContactEmail: parties.customerContactEmail,
      undertakingUnitId: parties.undertakingUnitId || null,
      sellerName: parties.sellerName || cfdi.issuer.name,
      sellerCountry: parties.sellerCountry,
      sellerAddress: parties.sellerAddress,
      sellerTelephone: parties.sellerTelephone,
      sellerFinanceEmail: parties.sellerFinanceEmail,
      bankAccountId: parties.bankAccountId,
      bankAccountName: parties.bankAccountName,
      bankName: parties.bankName,
      bankAccount: parties.bankAccount,
      bankSwiftCode: parties.bankSwiftCode,
      bankCode: parties.bankCode,
      bankAddress: parties.bankAddress,
      currency: cfdi.currency,
      amountExcludingTax: cfdi.subtotal,
      taxRate: cfdi.taxRate,
      taxAmount: cfdi.transferredTaxTotal,
      amountIncludingTax: cfdi.total,
      invoiceDate,
      dueDate: input.dueDate || null,
      comment: input.comment.slice(0, 500) || null,
      fileName: input.sourceFile?.fileName ?? null,
      fileType: input.sourceFile?.fileType ?? null,
      fileSize: input.sourceFile?.fileSize ?? null,
      fileProvider: input.sourceFile?.storageProvider ?? null,
      storageKey: input.sourceFile?.storageKey ?? null,
      actorName: input.actor.name ?? "飞书审批回传",
      instanceCode: input.instanceCode,
      cfdiUuid: cfdi.uuid.slice(0, 64),
      cfdiFolio: cfdi.fullNumber.slice(0, 64),
      cfdiTotalAmount: cfdi.total,
      cfdiIssuedAt: invoiceDate,
      cfdiCurrency: cfdi.currency.slice(0, 16),
      cfdiIssuerRfc: cfdi.issuer.rfc.slice(0, 32),
      cfdiReceiverRfc: cfdi.receiver.rfc.slice(0, 32),
    },
  );

  // 回填来源账单行：票号/币种/金额/开票日期一律取真实发票的值
  await execute(
    `UPDATE merge_cloud_rows
        SET invoiceNo = :invoiceNo, invoiceCurrency = :currency, invoiceNetAmount = :net,
            invoiceTaxRate = :taxRate, invoiceTaxAmount = :tax, invoiceTotalAmount = :total,
            invoiceDate = :invoiceDate, collectionInvoice = 'issued', updatedAt = NOW()
      WHERE id = :sourceId`,
    {
      invoiceNo: cfdi.fullNumber,
      currency: cfdi.currency,
      net: cfdi.subtotal,
      taxRate: cfdi.taxRate === null ? null : cfdi.taxRate / 100,
      tax: cfdi.transferredTaxTotal,
      total: cfdi.total,
      invoiceDate,
      sourceId: input.ownerId,
    },
  );

  await execute("UPDATE merge_common_feishu_approvals SET invoiceId = :invoiceId WHERE instanceCode = :instanceCode", {
    invoiceId: id,
    instanceCode: input.instanceCode,
  });
  return { invoiceId: id, invoiceNo: cfdi.fullNumber };
}


/**
 * 轮询需要处理的记录：
 *   1) 审批中的（查飞书状态）
 *   2) 已通过但还没登记真实发票的（审批人还没回传发票，或上次处理失败，下一轮自动重试）
 */
export async function syncPendingInvoiceApprovals(limit = 50) {
  const rows = await queryRows<{ instanceCode: string }>(
    `SELECT instanceCode FROM merge_common_feishu_approvals
      WHERE status = 'pending' OR (status = 'approved' AND (invoiceId IS NULL OR invoiceId = ''))
      ORDER BY submittedAt ASC LIMIT :limit`,
    { limit },
  );
  const result = { checked: rows.length, updated: 0, errors: [] as Array<{ instanceCode: string; error: string }> };
  for (const row of rows) {
    try {
      const synced = await syncInvoiceApproval(String(row.instanceCode));
      if (synced.changed) result.updated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push({ instanceCode: String(row.instanceCode), error: message });
      await execute("UPDATE merge_common_feishu_approvals SET syncError = :message, lastSyncedAt = CURRENT_TIMESTAMP WHERE instanceCode = :instanceCode", {
        message: message.slice(0, 500),
        instanceCode: String(row.instanceCode),
      });
    }
  }
  return result;
}

/* --------------------------------------------------------------------------
 * 附件：客户档案里已有文件 → 传到飞书拿 file_token（需要 drive:file:upload）
 * ------------------------------------------------------------------------ */

/**
 * 上传文件到飞书审批，拿到附件控件要用的文件 code。
 *
 * 必须用**审批自己的文件上传接口**：`attachmentV2` 控件的 value 是这里返回的 `data.code`，
 * 而云空间 `drive/v1/medias/upload_all` 返回的是 file_token，两者不通用（用错会报控件值不合法）。
 * 接口文档：https://open.feishu.cn/document/server-docs/approval-v4/file/upload-files.md
 */
const FEISHU_APPROVAL_FILE_UPLOAD_URL = "https://www.feishu.cn/approval/openapi/v2/file/upload";

export async function uploadApprovalAttachment(input: { bytes: Buffer; fileName: string }) {
  const token = await getFeishuTenantAccessToken();
  const fileName = input.fileName.trim() || "attachment.pdf";
  const form = new FormData();
  form.append("name", fileName);
  form.append("type", "attachment");
  form.append("content", new Blob([new Uint8Array(input.bytes)], { type: "application/octet-stream" }), fileName);
  const response = await fetch(FEISHU_APPROVAL_FILE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { code?: string } };
  if (body.code !== 0 || !body.data?.code) {
    const hint = body.code === 99991672 ? "（需要管理员给应用开通审批相关权限）" : "";
    throw new Error(`上传审批附件失败（${String(body.code)}）：${body.msg ?? response.status}${hint}`);
  }
  return String(body.data.code);
}

/** 读客户档案附件的内容（数据库回落或云盘都能读）。 */
export async function readCustomerAttachment(attachmentId: string) {
  const rows = await queryRows<Row>(
    `SELECT attachmentId, ownerType, ownerId, fileName, fileType, dataUrl, storageProvider, storageKey
       FROM merge_common_attachments WHERE attachmentId = :attachmentId LIMIT 1`,
    { attachmentId },
  );
  const row = rows[0];
  if (!row) throw new Error("客户档案附件不存在或已被删除");
  const stored = await readStoredFile({
    dataUrl: row.dataUrl,
    storageProvider: row.storageProvider,
    storageKey: row.storageKey,
    fileType: row.fileType,
    fileName: row.fileName,
  });
  if (!stored) throw new Error("客户档案附件内容读取失败");
  return { fileName: String(row.fileName ?? "attachment.pdf"), fileType: String(row.fileType ?? "application/octet-stream"), bytes: stored.bytes };
}

/* --------------------------------------------------------------------------
 * 预填：按来源单据算出审批要用的全部值，供开票弹层展示
 * ------------------------------------------------------------------------ */

type UndertakingUnitRow = { undertakingUnitId: string; undertakingUnitCode: string; name: string; shortName: string; entityName: string; paymentTermDays: number | null; financeEmail: string | null };
type CustomerApprovalRow = { customerId: string; customerCode: string; name: string; shortName: string; nameEn: string; taxNumber: string; taxRegime: string; address: string; postCode: string };

async function loadUndertakingUnit(undertakingUnitId: string) {
  if (!undertakingUnitId) return null;
  const rows = await queryRows<UndertakingUnitRow>(
    `SELECT undertakingUnitId, undertakingUnitCode, name, shortName, entityName, paymentTermDays, financeEmail
       FROM merge_common_undertaking_units
      WHERE undertakingUnitId = :id OR undertakingUnitCode = :id OR entityCode = :id LIMIT 1`,
    { id: undertakingUnitId },
  );
  return rows[0] ?? null;
}

async function loadCustomerForApproval(customerId: string) {
  if (!customerId) return null;
  const rows = await queryRows<CustomerApprovalRow>(
    `SELECT customerId, customerCode, name, shortName, nameEn, taxNumber, taxRegime, address, postCode
       FROM merge_common_customers WHERE customerId = :id OR customerCode = :id LIMIT 1`,
    { id: customerId },
  );
  return rows[0] ?? null;
}

async function listCustomerAttachments(customerId: string) {
  if (!customerId) return [];
  return queryRows<{ attachmentId: string; fileName: string; fileSize: number; uploadedAt: string | null }>(
    `SELECT attachmentId, fileName, fileSize, DATE_FORMAT(uploadedAt, '%Y-%m-%d %H:%i') AS uploadedAt
       FROM merge_common_attachments WHERE ownerType = 'customers' AND ownerId = :customerId ORDER BY uploadedAt DESC`,
    { customerId },
  );
}

function addDays(dateString: string, days: number) {
  const base = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(base.getTime())) return dateString;
  return new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
}

/**
 * 开票审批预填：复用开票预填的结果（客户/承接单位/金额/账期），
 * 再补上审批特有的东西：主体分支、约定收款日、客户开票信息、客户档案附件候选。
 */
export async function buildInvoiceApprovalPrefill(params: { sourceType: InvoiceSourceType; sourceId?: string | null; sourceIds?: string[] | null }) {
  const base = await buildInvoicePrefill(params);
  const unit = await loadUndertakingUnit(String(base.undertakingUnitId ?? ""));
  const party = resolveInvoiceApprovalParty({
    undertakingUnitCode: unit?.undertakingUnitCode,
    undertakingUnitName: [unit?.shortName, unit?.entityName, unit?.name].filter(Boolean).join(" "),
  });
  const customer = await loadCustomerForApproval(String(base.customerId ?? ""));
  const attachments = await listCustomerAttachments(String(customer?.customerId ?? base.customerId ?? ""));
  const termDays = Number(unit?.paymentTermDays ?? 30) || 30;
  const invoiceDate = String(base.invoiceDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!party) blockers.push("承接单位对应不到飞书审批主体（需要 MXGS01 / CLGS01 / BRGS01 之一）");
  if (party?.branch === "br") blockers.push("巴西主体不走飞书审批，请用「生成并标记已开票」本地开票");
  if (party?.branch === "mx") {
    if (!customer) blockers.push("来源单据没有客户，无法带出客户开票信息");
    else {
      if (!String(customer.taxNumber ?? "").trim()) blockers.push("客户档案缺少税号（TAX ID）");
      if (!String(customer.taxRegime ?? "").trim()) blockers.push("客户档案缺少税制（Régimen Fiscal）");
      if (!String(customer.address ?? "").trim()) blockers.push("客户档案缺少注册地址");
      if (!String(customer.postCode ?? "").trim()) warnings.push("客户档案缺少邮编，需要手工填写");
    }
    if (!attachments.length) warnings.push("客户档案没有附件，需要现场上传 CSF（依赖飞书 drive:file:upload 权限）");
  }

  return {
    approvalCode: getInvoiceApprovalCode(),
    existingApproval: await findActiveInvoiceApproval(params.sourceType, String(base.sourceId ?? params.sourceId ?? "")),
    branch: party?.branch ?? null,
    companyOptionKey: party?.optionKey ?? "",
    companyText: party?.companyText ?? "",
    sourceNo: base.sourceNo ?? "",
    period: base.period ?? "",
    suggestedInvoiceNo: base.suggestedInvoiceNo ?? "",
    invoiceDate,
    lines: base.lines ?? [],
    currency: base.currency ?? "",
    amountIncludingTax: base.amountIncludingTax ?? "",
    amountCurrencyOptions: [...APPROVAL_AMOUNT_CURRENCIES[party?.branch === "cl" ? "cl" : "mx"]],
    amountExcludingTax: base.amountExcludingTax ?? "",
    taxRate: base.taxRate ?? "",
    suggestedPurpose: [base.period, customer?.shortName ?? customer?.name ?? ""].filter(Boolean).join(" · "),
    suggestedInvoiceContent: "project",
    paymentReceivedTime: addDays(invoiceDate, termDays),
    paymentTermDays: termDays,
    customer: customer
      ? {
        customerId: customer.customerId,
        name: customer.nameEn || customer.name || customer.shortName,
        taxId: customer.taxNumber ?? "",
        taxRegime: customer.taxRegime ?? "",
        address: customer.address ?? "",
        postCode: customer.postCode ?? "",
      }
      : null,
    customerAttachments: attachments,
    options: {
      paymentMethods: Object.entries(PAYMENT_METHOD_OPTIONS).map(([key, value]) => ({ key, value: value.key, label: value.text })),
      cfdiCodes: Object.entries(CFDI_OPTIONS).map(([key, value]) => ({ key, value: value.key, label: value.text })),
      chileInvoiceTypes: Object.entries(CHILE_INVOICE_TYPE_OPTIONS).map(([key, value]) => ({ key, value: value.key, label: value.text })),
      chileNote2: Object.entries(CHILE_NOTE2_OPTIONS).map(([key, value]) => ({ key, value: value.key, label: value.text })),
    },
    blockers,
    warnings,
  };
}

/**
 * 从来源单据发起开票审批：预填 → 组装表单 → 发起 → 登记台账。
 *
 * CSF 附件两种来源：传 cfsAttachmentId（客户档案里已有附件，服务端读出来再传飞书）
 * 或传 cfsFileToken（调用方已经拿到 token）。
 */
export async function submitInvoiceApprovalFromSource(input: {
  sourceType: InvoiceSourceType;
  sourceId: string;
  sourceIds?: string[];
  invoiceId?: string | null;
  starterOpenId: string;
  starterUserId?: string;
  starterName?: string;
  purpose?: string;
  paymentReceivedTime: string;
  invoiceContent?: string;
  paymentMethodKey?: string;
  cfdiCodeKey?: string;
  customerOverride?: { name?: string; taxId?: string; taxRegime?: string; address?: string; postCode?: string };
  cfsAttachmentId?: string;
  cfsFileToken?: string;
  /** 开票金额与币种：弹层里默认带账单口径，允许人工改（飞书金额控件只能填这两个币种之一） */
  amountIncludingTax?: number;
  amountCurrency?: string;
  chile?: { invoiceTypeKey: string; amountIncludingTax: number; note1: string; note2Key: string; note3: number; note4: number; customerLabel?: string };
}) {
  const prefill = await buildInvoiceApprovalPrefill({ sourceType: input.sourceType, sourceId: input.sourceId, sourceIds: input.sourceIds });
  if (!prefill.branch) throw new Error("承接单位对应不到飞书审批主体，无法发起审批");
  if (prefill.branch === "br") throw new Error("巴西主体不走飞书审批，请使用本地开票");
  if (prefill.blockers.length) throw new Error(`发起审批前需要先处理：${prefill.blockers.join("；")}`);
  // 防重复发起：同一张账单上已经有审批中/已通过的审批时不再新建（真实发票靠轮询自动抓回）
  if (prefill.existingApproval) {
    const existing = prefill.existingApproval;
    const label = existing.status === "pending" ? "审批中" : "已通过、待回传发票";
    throw new Error(`该账单已有一条审批（${label}，单号 ${existing.serialNumber || existing.instanceCode}），不需要重复发起`);
  }

  const customer = {
    name: input.customerOverride?.name ?? prefill.customer?.name ?? "",
    taxId: input.customerOverride?.taxId ?? prefill.customer?.taxId ?? "",
    taxRegime: input.customerOverride?.taxRegime ?? prefill.customer?.taxRegime ?? "",
    address: input.customerOverride?.address ?? prefill.customer?.address ?? "",
    postCode: input.customerOverride?.postCode ?? prefill.customer?.postCode ?? "",
  };

  let cfsFileTokens: string[] = [];
  if (prefill.branch === "mx") {
    if (input.cfsFileToken) cfsFileTokens = [input.cfsFileToken];
    else if (input.cfsAttachmentId) {
      const attachment = await readCustomerAttachment(input.cfsAttachmentId);
      cfsFileTokens = [await uploadApprovalAttachment({ bytes: attachment.bytes, fileName: attachment.fileName })];
    }
    if (!cfsFileTokens.length) throw new Error("墨西哥主体必须选择客户 CSF 附件");
    if (!customer.taxRegime.trim()) throw new Error("客户档案缺少税制（Régimen Fiscal）");
    if (!customer.postCode.trim()) throw new Error("客户档案缺少邮编");
  }

  // 金额与币种：弹层里允许人工覆盖（默认带账单口径）
  const amount = Number(input.amountIncludingTax ?? prefill.amountIncludingTax ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("开票金额不正确，无法发起审批");
  const amountCurrency = resolveApprovalAmountCurrency(prefill.branch, input.amountCurrency ?? prefill.currency);

  const form = buildInvoiceApprovalForm({
    branch: prefill.branch,
    companyOptionKey: prefill.companyOptionKey,
    purpose: (input.purpose ?? prefill.suggestedPurpose).slice(0, 255),
    paymentReceivedTime: input.paymentReceivedTime,
    amountCurrency,
    mexico: prefill.branch === "mx"
      ? {
        customerName: customer.name,
        taxId: customer.taxId,
        taxRegime: customer.taxRegime,
        paymentMethodKey: input.paymentMethodKey ?? PAYMENT_METHOD_OPTIONS.PPD.key,
        address: customer.address,
        postCode: customer.postCode,
        amountIncludingTax: amount,
        invoiceContent: input.invoiceContent ?? prefill.suggestedInvoiceContent,
        cfdiCodeKey: input.cfdiCodeKey ?? CFDI_OPTIONS.G03.key,
        cfsFileTokens,
      }
      : undefined,
    chile: prefill.branch === "cl" && input.chile
      ? {
        customerLabel: input.chile.customerLabel ?? `Customer: ${prefill.customer?.name ?? ""}`.trim(),
        invoiceTypeKey: input.chile.invoiceTypeKey,
        amountIncludingTax: Number(input.chile.amountIncludingTax),
        note1: input.chile.note1,
        note2Key: input.chile.note2Key,
        note3: Number(input.chile.note3),
        note4: Number(input.chile.note4),
      }
      : undefined,
  });
  if (prefill.branch === "cl" && !input.chile) throw new Error("智利主体需要填写发票信息（发票类型/金额/备注）");

  const result = await submitInvoiceApproval({
    ownerType: input.sourceType === "cloud_row" ? "cloud_row"
      : input.sourceType === "billing_statement" ? "billing_statement"
        : input.sourceType === "service_fee" ? "service_fee" : "settlement_invoice",
    ownerId: input.sourceId,
    allocationSourceIds: input.sourceIds ?? [],
    ownerNo: prefill.sourceNo,
    period: prefill.period,
    starterOpenId: input.starterOpenId,
    starterUserId: input.starterUserId,
    starterName: input.starterName,
    invoiceId: input.invoiceId ?? null,
    form,
    title: (input.purpose ?? prefill.suggestedPurpose).slice(0, 255),
  });

  return { ...result, form };
}

/* --------------------------------------------------------------------------
 * 审批人回传的发票附件（PDF + XML）→ 落盘 → 解析 → 回填 → 核验
 *
 * 审批人在"通过"时可以把发票传在审批意见里，这些附件出现在实例 timeline 的 files 字段，
 * 并且带**有效期签名直链**，所以必须在同步时立刻下载存到我们自己的存储，不能只存 URL。
 * ------------------------------------------------------------------------ */

export type ApprovalTimelineAttachment = {
  title: string;
  size: number;
  type: string;
  url: string;
  createdAt: string;
  uploaderOpenId: string;
};

/** 取审批实例上所有"审批意见附件"（按时间顺序）。 */
export async function fetchApprovalTimelineAttachments(instanceCode: string): Promise<ApprovalTimelineAttachment[]> {
  const data = await callFeishu<{ timeline?: Array<Record<string, unknown>> }>(
    `/open-apis/approval/v4/instances/${encodeURIComponent(instanceCode)}`,
    {},
    "查询飞书审批",
  );
  const attachments: ApprovalTimelineAttachment[] = [];
  for (const entry of data?.timeline ?? []) {
    const files = (entry.files ?? []) as Array<Record<string, unknown>>;
    for (const file of files) {
      const url = String(file.url ?? "");
      if (!url) continue;
      attachments.push({
        title: String(file.title ?? "attachment"),
        size: Number(file.file_size ?? 0),
        type: String(file.type ?? "attachment"),
        url,
        createdAt: new Date(Number(entry.create_time ?? 0)).toISOString(),
        uploaderOpenId: String(entry.open_id ?? ""),
      });
    }
  }
  return attachments;
}

export async function downloadApprovalAttachment(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载发票附件失败（${response.status}）`);
  return Buffer.from(await response.arrayBuffer());
}

const KEY_TO_CFDI_USE = Object.fromEntries(Object.values(CFDI_OPTIONS).map((option) => [option.key, option.text.split(" ")[0]]));
const KEY_TO_PAYMENT_METHOD = Object.fromEntries(Object.values(PAYMENT_METHOD_OPTIONS).map((option) => [option.key, option.text.split(" ")[0]]));

export type ApplyInvoiceFilesResult = {
  instanceCode: string;
  /** 建立/更新的本地开票记录 ID（没拿到 XML 时为空） */
  invoiceId?: string;
  invoiceFiles: { pdf: boolean; xml: boolean };
  cfdi: CfdiInvoice | null;
  issues: InvoiceVerificationIssue[];
  attachedFileNames: string[];
  /** 从发票里补空到档案的字段（缺才补，已有值不改） */
  archiveFilled: string[];
  note: string;
};

/**
 * 处理审批人回传的真实发票：落盘 → 解析 → 用真实信息建立本地开票记录 → 核验 → 档案回填。
 *
 * 飞书审批路径不生成我方票面，所以这里是**唯一**产生本地开票记录的地方，
 * 票号/金额/开票日期全部取 CFDI 真实发票的值。
 * 幂等：同名附件已存在就跳过落盘；台账已有 invoiceId 就不重复建记录。
 */
export async function applyApprovedInvoiceFiles(instanceCode: string): Promise<ApplyInvoiceFilesResult> {
  const rows = await queryRows<Row>(
    `SELECT id, ownerType, ownerId, invoiceId, formJson, period, title FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1`,
    { instanceCode },
  );
  const record = rows[0];
  if (!record) throw new Error(`未找到审批台账：${instanceCode}`);
  const ownerId = String(record.ownerId ?? "");
  let invoiceId = String(record.invoiceId ?? "");

  const files = await fetchApprovalTimelineAttachments(instanceCode);
  const xmlFile = files.find((file) => /\.xml$/i.test(file.title));
  const pdfFile = files.find((file) => /\.pdf$/i.test(file.title));
  const result: ApplyInvoiceFilesResult = {
    instanceCode,
    invoiceFiles: { pdf: Boolean(pdfFile), xml: Boolean(xmlFile) },
    cfdi: null,
    issues: [],
    attachedFileNames: [],
    archiveFilled: [],
    note: "",
  };
  if (!files.length) {
    result.note = "审批回复里没有附件，等审批人回传发票后再同步";
    await saveInvoiceParseResult(instanceCode, result);
    return result;
  }

  // 1) 附件落盘到该账单行的「客户开票附件」位（同名跳过，避免重复）
  const existing = new Set((await listCloudAttachments("invoice", ownerId)).map((item) => String(item.fileName ?? "")));
  let pdfStored: { fileName: string; fileType: string; fileSize: number; storageProvider: string; storageKey: string | null } | null = null;
  for (const file of [pdfFile, xmlFile].filter(Boolean) as ApprovalTimelineAttachment[]) {
    if (existing.has(file.title)) {
      continue;
    }
    const bytes = await downloadApprovalAttachment(file.url);
    const attachment = await storeCloudAttachment(
      "invoice",
      ownerId,
      { fileName: file.title, fileType: /\.xml$/i.test(file.title) ? "application/xml" : "application/pdf", bytes },
      { userId: "", displayName: "飞书审批回传", email: "" },
    ) as Record<string, unknown>;
    result.attachedFileNames.push(file.title);
    if (file === pdfFile) {
      pdfStored = {
        fileName: String(attachment.fileName ?? file.title),
        fileType: String(attachment.fileType ?? "application/pdf"),
        fileSize: Number(attachment.fileSize ?? bytes.length),
        storageProvider: String(attachment.storageProvider ?? "db"),
        storageKey: attachment.storageKey ? String(attachment.storageKey) : null,
      };
    }
  }

  if (!xmlFile) {
    result.note = "审批回复里没有 XML，只有 PDF（已存档，未能解析发票信息）";
    await saveInvoiceParseResult(instanceCode, result);
    return result;
  }

  // 2) 解析真实发票
  const cfdi = parseCfdiInvoice((await downloadApprovalAttachment(xmlFile.url)).toString("utf8"));
  result.cfdi = cfdi;

  // 3) 用真实发票信息建立本地开票记录（已有记录则刷新 CFDI 字段）
  if (!invoiceId) {
    const form = JSON.parse(String(record.formJson ?? "[]")) as InvoiceApprovalFormItem[];
    const purpose = String(readApprovalFormValue(form, APPROVAL_FIELDS.purpose) ?? "").trim() || String(record.title ?? "");
    const dueDate = String(readApprovalFormValue(form, APPROVAL_FIELDS.paymentReceivedTime) ?? "").trim().slice(0, 10);
    const created = await createInvoiceFromCfdi({
      instanceCode,
      ownerId,
      period: String(record.period ?? ""),
      dueDate,
      comment: purpose,
      actor: { userId: String(record.starterUserId ?? ""), name: String(record.starterName ?? "") },
      cfdi,
      sourceFile: pdfStored,
    });
    invoiceId = created.invoiceId;
  } else {
    await execute(
      `UPDATE merge_common_invoices
          SET cfdiUuid = :uuid, cfdiFolio = :folio, cfdiTotalAmount = :total, cfdiIssuedAt = :issuedAt,
              cfdiCurrency = :currency, cfdiIssuerRfc = :issuerRfc, cfdiReceiverRfc = :receiverRfc, approvalStatus = 'approved'
        WHERE id = :invoiceId`,
      {
        uuid: cfdi.uuid.slice(0, 64),
        folio: cfdi.fullNumber.slice(0, 64),
        total: cfdi.total,
        issuedAt: cfdi.issuedAt.slice(0, 10),
        currency: cfdi.currency.slice(0, 16),
        issuerRfc: cfdi.issuer.rfc.slice(0, 32),
        receiverRfc: cfdi.receiver.rfc.slice(0, 32),
        invoiceId,
      },
    );
  }
  result.invoiceId = invoiceId;

  // 4) 核验：发票 vs 账单行/档案
  const form2 = JSON.parse(String(record.formJson ?? "[]")) as InvoiceApprovalFormItem[];
  const [rowParties] = await queryRows<{ customerTax: string | null; unitTax: string | null }>(
    `SELECT c.taxNumber AS customerTax, u.taxNumber AS unitTax
       FROM merge_cloud_rows r
       LEFT JOIN merge_common_customers c ON c.customerId = r.customerId
       LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = r.undertakingUnitId
      WHERE r.id = :id LIMIT 1`,
    { id: ownerId },
  );
  const [expectedAmount] = await queryRows<{ total: string }>(
    "SELECT invoiceTotalAmount AS total FROM merge_cloud_rows WHERE id = :id LIMIT 1",
    { id: ownerId },
  );
  result.issues = verifyInvoiceAgainstExpectation(cfdi, {
    total: Number(expectedAmount?.total ?? 0),
    issuerRfc: String(rowParties?.unitTax ?? ""),
    receiverRfc: String(rowParties?.customerTax ?? ""),
    cfdiUse: KEY_TO_CFDI_USE[String(readApprovalFormValue(form2, APPROVAL_FIELDS.cfdiCode) ?? "")] ?? "",
    paymentMethod: KEY_TO_PAYMENT_METHOD[String(readApprovalFormValue(form2, APPROVAL_FIELDS.paymentMethod) ?? "")] ?? "",
  });

  result.note = result.issues.length
    ? `发票已登记，但与单据存在差异：${result.issues.map((issue) => `${issue.field} 应为 ${issue.expected}、实际 ${issue.actual}`).join("；")}`
    : "已按真实发票信息登记并核验通过";
  if (!result.issues.length) {
    result.archiveFilled = await backfillArchiveFromInvoice(cfdi, ownerId);
    if (result.archiveFilled.length) result.note += `；已补齐档案：${result.archiveFilled.join("、")}`;
  }
  await saveInvoiceParseResult(instanceCode, result);
  return result;
}

/** 发票里的税号/邮编，缺就补到档案上（已有值不动）。 */
async function backfillArchiveFromInvoice(cfdi: CfdiInvoice, ownerId: string) {
  const rows = await queryRows<{ undertakingUnitId: string; customerId: string; unitTax: string | null; customerTax: string | null; postCode: string | null }>(
    `SELECT r.undertakingUnitId, r.customerId, u.taxNumber AS unitTax, c.taxNumber AS customerTax, c.postCode AS postCode
       FROM merge_cloud_rows r
       LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = r.undertakingUnitId
       LEFT JOIN merge_common_customers c ON c.customerId = r.customerId
      WHERE r.id = :id LIMIT 1`,
    { id: ownerId },
  );
  const row = rows[0];
  if (!row) return [];
  const filled: string[] = [];

  if (row.undertakingUnitId && !String(row.unitTax ?? "").trim() && cfdi.issuer.rfc) {
    await execute("UPDATE merge_common_undertaking_units SET taxNumber = :rfc WHERE undertakingUnitId = :id", { rfc: cfdi.issuer.rfc, id: row.undertakingUnitId });
    filled.push(`承接单位税号 ${cfdi.issuer.rfc}`);
  }
  if (row.customerId && !String(row.customerTax ?? "").trim() && cfdi.receiver.rfc) {
    await execute("UPDATE merge_common_customers SET taxNumber = :rfc WHERE customerId = :id", { rfc: cfdi.receiver.rfc, id: row.customerId });
    filled.push(`客户税号 ${cfdi.receiver.rfc}`);
  }
  if (row.customerId && !String(row.postCode ?? "").trim() && cfdi.receiver.zipCode) {
    await execute("UPDATE merge_common_customers SET postCode = :zip WHERE customerId = :id", { zip: cfdi.receiver.zipCode, id: row.customerId });
    filled.push(`客户税籍邮编 ${cfdi.receiver.zipCode}`);
  }
  return filled;
}

async function saveInvoiceParseResult(instanceCode: string, result: ApplyInvoiceFilesResult) {
  await execute(
    "UPDATE merge_common_feishu_approvals SET invoiceParseJson = :json, syncError = :note WHERE instanceCode = :instanceCode",
    { json: JSON.stringify(result).slice(0, 60000), note: result.note.slice(0, 500), instanceCode },
  );
}
