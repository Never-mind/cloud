/**
 * 成本款付款申请（飞书审批「成本款付款申请」A5075F7F-2EC5-4594-875B-14BEAEFD45E3）。
 *
 * 三个入口共用同一张审批，但走**不同的明细分支**（字段不共用）：
 *   ① 华为云业务 → 供应商付款   → 成本部门 CLOUD + 成本项目 华为云 → 付款明细-华为云（多一列客户名称）
 *   ② 集采系统 → 发票汇总        → 成本部门 CLOUD + 成本项目 其他   → 付款明细-其他
 *   ③ 算力系统 → 采购订单        → 成本部门 CLOUD + 成本项目 算力   → 付款明细-算力（多订单号、批次序号，支持多单合并）
 *
 * 提交方式与开票审批一致：应用身份（tenant_access_token）+ 发起人 open_id；
 * 附件先调审批附件上传接口拿 file_token 再填进表单。
 * 审批台账复用 `merge_common_feishu_approvals`，通过后回写来源单据的付款状态。
 */
import { randomUUID } from "node:crypto";
import { execute, queryRows, type Row } from "./db";
import { FEISHU_API_BASE } from "./feishu-auth-config";
import { getFeishuTenantAccessToken } from "./feishu-message-service";
import {
  fetchInvoiceApprovalInstance,
  uploadApprovalAttachment,
  type InvoiceApprovalFormItem,
} from "./feishu-approval-service";
import { readFile as readStoredFile } from "./file-storage-service";

export const COST_PAYMENT_APPROVAL_CODE =
  (process.env.FEISHU_COST_PAYMENT_APPROVAL_CODE ?? "").trim() || "A5075F7F-2EC5-4594-875B-14BEAEFD45E3";

/** 明细分支：华为云 / 其他（集采）/ 算力。 */
export type CostPaymentBranch = "huawei" | "other" | "compute";

export const COST_PAYMENT_BRANCHES = ["huawei", "other", "compute"] as const;

export function isCostPaymentBranch(value: unknown): value is CostPaymentBranch {
  return (COST_PAYMENT_BRANCHES as readonly string[]).includes(String(value ?? ""));
}

/**
 * 飞书日期控件要求 RFC3339（带时区），传纯 `YYYY-MM-DD` 会报
 * 「控件值不合法或者为空」。这里统一补齐为东八区零点。
 */
export function formatApprovalPaymentDate(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error("请填写需求付款日期（格式 YYYY-MM-DD）");
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`;
}

/** 发起人要按本人身份提交，这里取当前登录账号绑定的飞书 open_id。 */
export async function loadUserFeishuOpenId(userId: string) {
  const rows = await queryRows<{ feishuOpenId: string | null }>(
    "SELECT feishuOpenId FROM merge_common_users WHERE userId = :userId LIMIT 1",
    { userId },
  );
  return String(rows[0]?.feishuOpenId ?? "").trim();
}

/** 审批台账里的来源类型。 */
export type CostPaymentOwnerType = "cloud_supplier_payment" | "settlement_invoice_payment" | "purchase_order_payment";

export type CostPaymentAttachmentSource =
  | "purchase_order"
  | "settlement_invoice"
  | "settlement_project"
  | "cloud_supplier_payment"
  | "cloud_invoice";

export type CostPaymentAttachmentOption = {
  id: string;
  source: CostPaymentAttachmentSource;
  sourceLabel: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string | null;
  description?: string;
};

export type CostPaymentAttachmentRef = {
  source: CostPaymentAttachmentSource;
  attachmentId: string;
};

/**
 * 供应商付款附件用过三种 ownerId：
 *   `202609::<supplierId>`（账单分组键，早期上传）
 *   `supplier-payment:202609:id:<supplierId>`（列表行 id）
 *   `supplier-payment:<period>:<supplierId>`（未匹配供应商时的名称键）
 * 三个都要认，否则同一笔付款的发票会看不到。
 */
export function cloudPaymentAttachmentOwnerIds(entry: {
  ownerId?: string;
  attachmentOwnerId?: string;
  period?: string;
  supplierId?: string;
}) {
  const ids = new Set<string>();
  for (const value of [entry.ownerId, entry.attachmentOwnerId]) {
    const text = String(value ?? "").trim();
    if (text) ids.add(text);
  }
  const period = String(entry.period ?? "").trim();
  const supplierId = String(entry.supplierId ?? "").trim();
  if (period && supplierId) {
    ids.add(`${period}::${supplierId}`);
    ids.add(`supplier-payment:${period}:id:${supplierId}`);
    ids.add(`supplier-payment:${period}:${supplierId}`);
  }
  return [...ids];
}

/** 审批控件 id（来自审批定义，改表单要同步这里）。 */
const WIDGET = {
  reason: "widget16510492382000001",
  department: "widget17689025485230001",
  company: "widget17688921620770001",
  project: "widget17688932030050001",
} as const;

const LIST_WIDGET: Record<CostPaymentBranch, string> = {
  huawei: "widget17688936313800001",
  other: "widget17688942726490001",
  compute: "widget17688927004010001",
};

const COLUMN_WIDGET: Record<CostPaymentBranch, Record<string, string>> = {
  huawei: {
    customer: "widget17688981032310001",
    amount: "widget17688943738080001",
    payee: "widget17688936315920001",
    bankAccount: "widget17688936316420001",
    bankName: "widget17688936316920001",
    swiftCode: "widget17688936317370001",
    fee: "widget17688936317830001",
    paymentDate: "widget17688936318320001",
    invoice: "widget17688936318830001",
    attachment: "widget17688936319310001",
  },
  other: {
    amount: "widget17688944050460001",
    payee: "widget17688942727300001",
    bankAccount: "widget17688942728320001",
    bankName: "widget17688942729510001",
    swiftCode: "widget17688942730430001",
    fee: "widget17688942731340001",
    paymentDate: "widget17688942732180001",
    invoice: "widget17688942733080001",
    attachment: "widget17688942733880001",
  },
  compute: {
    amount: "widget17688927593880001",
    orderNo: "widget17688927361370001",
    batchNo: "widget17688927488200001",
    payee: "widget17688927943060001",
    bankAccount: "widget17688928379240001",
    bankName: "widget17688928487290001",
    swiftCode: "widget17688928592950001",
    fee: "widget17688928868790001",
    paymentDate: "widget17688929678340001",
    invoice: "widget17688930169900001",
    attachment: "widget17688930544840001",
  },
};

/** 成本部门固定 CLOUD；成本项目按入口固定。 */
export const COST_PAYMENT_DEPARTMENT_CLOUD = "mkmewlrf-r482htyi7nc-0";
const PROJECT_KEY: Record<CostPaymentBranch, string> = {
  huawei: "mkm9capp-w1hyx3b3i3o-0",
  other: "mkm9d6gc-qj9dr11qw2d-1",
  compute: "mkm9capp-x50k57e3ab-0",
};

/** 成本公司：系统承接单位代码 → 审批公司选项（香港万众按业务确认取 HK WANZHONG）。 */
const COMPANY_KEY_BY_UNIT_CODE: Record<string, string> = {
  BRGS01: "mkm8pzj4-kd7k7oi69qa-0", // LUZ BRAZIL LTDA（巴西）
  CLGS01: "mkm8pzj4-7h24tjq44u-0", // LUZ TECHNOLOGY SpA（智利）
  MXGS01: "mkm8pzj4-abuwjgwrngb-0", // LUZ NEWMEDIA, S.A. DE. C.V.（墨西哥）
  MXGS02: "mkm8qka3-2t0q4vap5tm-5", // JIXUN TECHNOLOGIES DE MÉXICO SA DE CV
  CNGS01: "ml99cf0q-7qtk8vbp2o7-1", // 深圳市欣喜连连科技有限公司
  HKGS01: "mkm8qka3-oo6hewsdtv-1", // HK WANZHONG TECHNOLOGY LIMITED
  // AGTS01（阿根廷）：审批里还没有对应公司选项，等飞书补完再加一行。
};

/** 手续费：四个选项，默认「无」。 */
export const COST_PAYMENT_FEE_OPTIONS = [
  { value: "none", label: "无" },
  { value: "ours", label: "我方全额承担" },
  { value: "theirs", label: "对方全额承担" },
  { value: "shared", label: "共同承担" },
] as const;
export type CostPaymentFeeKey = (typeof COST_PAYMENT_FEE_OPTIONS)[number]["value"];

const FEE_WIDGET_KEY: Record<CostPaymentBranch, Record<CostPaymentFeeKey, string>> = {
  huawei: { none: "mkm9lhk7-kmi0i9zdbir-0", ours: "mkm9lhk7-k5ea9fpsr08-0", theirs: "mkm9lhk7-lh4tumvedap-0", shared: "mkm9lhk7-b7q6cddvuae-0" },
  other: { none: "mkm9z8fi-47mli8tfaso-0", ours: "mkm9z8fi-d2hv3ix88g4-0", theirs: "mkm9z8fi-rkzyd8rg1ym-0", shared: "mkm9z8fi-gp7huhbg2yk-0" },
  compute: { none: "mkm95isf-xbhg0iiehbn-0", ours: "mkm95isf-8dkpo90gx49-0", theirs: "mkm95iuv-gwnppw3grbt-1", shared: "mkm95iuv-kl4obhg77uh-3" },
};

const INVOICE_WIDGET_KEY: Record<CostPaymentBranch, { issued: string; notIssued: string }> = {
  huawei: { issued: "mkm9lhmz-tx8yntu2p5m-0", notIssued: "mkm9lhmz-1j9s4cjwyes-0" },
  other: { issued: "mkm9z8kc-cvafk0fi4re-0", notIssued: "mkm9z8kc-r6tcu6xyljf-0" },
  compute: { issued: "mkm98b6m-1yn589o5fd8-0", notIssued: "mkm98b6m-lnt6rcd89r-0" },
};

/** 华为云分支的客户名称选项；其余分支没有这一列。 */
const CUSTOMER_WIDGET_KEY: Record<string, string> = {
  枭龙云: "mkmc9br3-99aw3z0mn3-0",
  barnorte: "mkmc9br3-u2m28i1ldp-0",
  万博: "mkmc9br3-ui70g8oievh-0",
};

/** 系统客户名 → 审批客户选项；匹配不到返回空串（提交前会被拦下并提示）。 */
export function resolveCostPaymentCustomerKey(customerName: unknown) {
  const name = String(customerName ?? "").trim();
  if (!name) return "";
  if (CUSTOMER_WIDGET_KEY[name]) return CUSTOMER_WIDGET_KEY[name];
  const upper = name.toUpperCase();
  if (upper.includes("BANORTE")) return CUSTOMER_WIDGET_KEY.barnorte;
  if (name.includes("枭龙")) return CUSTOMER_WIDGET_KEY["枭龙云"];
  if (name.includes("万博")) return CUSTOMER_WIDGET_KEY["万博"];
  return "";
}

/** 承接单位代码 → 审批公司选项；没映射到的（如阿根廷）返回空串。 */
export function resolveCostPaymentCompanyKey(undertakingUnitCode: unknown) {
  return COMPANY_KEY_BY_UNIT_CODE[String(undertakingUnitCode ?? "").trim().toUpperCase()] ?? "";
}

export type CostPaymentEntryInput = {
  ownerType: CostPaymentOwnerType;
  ownerId: string;
  ownerNo?: string;
  period?: string;
  supplierId?: string;
  undertakingUnitCode: string;
  /** 成本公司直接带上飞书选项 key（弹层里可切换承接单位） */
  companyKey?: string;
  amount: number;
  currency: string;
  payee: string;
  bankAccount: string;
  bankName: string;
  swiftCode: string;
  feeKey?: CostPaymentFeeKey;
  paymentDate: string;
  invoiceIssued?: boolean;
  /** 华为云分支必填 */
  customerName?: string;
  /** 客户名称直接带上飞书选项 key（优先于 customerName） */
  customerOptionKey?: string;
  /** 手续费 / 发票直接带上飞书选项 key（优先于 feeKey / invoiceIssued） */
  feeOptionKey?: string;
  invoiceOptionKey?: string;
  /** 算力分支必填 */
  orderNo?: string;
  batchNo?: string;
  /** 弹层里新上传的附件（base64 dataUrl） */
  attachments?: Array<{ fileName: string; dataUrl: string }>;
  /** 从来源单据已有附件中勾选的引用 */
  attachmentRefs?: CostPaymentAttachmentRef[];
  /** 采购订单 / 供应商付款附件的归属 ID */
  attachmentOwnerId?: string;
  /** 集采项目附件需要的项目 ID */
  projectId?: string;
};

export function buildCostPaymentForm(
  branch: CostPaymentBranch,
  input: {
    reason: string;
    companyKey: string;
    entries: Array<{
      amount: number;
      currency: string;
      payee: string;
      bankAccount: string;
      bankName: string;
      swiftCode: string;
      feeKey: CostPaymentFeeKey;
      /** 直接来自飞书选项的手续费 key（优先） */
      feeOptionValue?: string;
      invoiceOptionValue?: string;
      paymentDate: string;
      invoiceIssued: boolean;
      customerKey?: string;
      orderNo?: string;
      batchNo?: string;
      attachmentTokens: string[];
    }>;
  },
): InvoiceApprovalFormItem[] {
  const columns = COLUMN_WIDGET[branch];
  const rows: InvoiceApprovalFormItem[][] = input.entries.map((entry) => {
    const items: InvoiceApprovalFormItem[] = [];
    if (branch === "huawei") {
      items.push({ id: columns.customer, type: "radioV2", value: entry.customerKey ?? "" });
    }
    if (branch === "compute") {
      items.push({ id: columns.orderNo, type: "input", value: entry.orderNo ?? "" });
      items.push({ id: columns.batchNo, type: "input", value: entry.batchNo ?? "" });
    }
    items.push(
      { id: columns.amount, type: "amount", value: entry.amount, currency: entry.currency },
      { id: columns.payee, type: "input", value: entry.payee },
      { id: columns.bankAccount, type: "input", value: entry.bankAccount },
      { id: columns.bankName, type: "input", value: entry.bankName },
      { id: columns.swiftCode, type: "input", value: entry.swiftCode },
      { id: columns.fee, type: "radioV2", value: entry.feeOptionValue || FEE_WIDGET_KEY[branch][entry.feeKey] },
      { id: columns.paymentDate, type: "date", value: formatApprovalPaymentDate(entry.paymentDate) },
      { id: columns.invoice, type: "radioV2", value: entry.invoiceOptionValue || (entry.invoiceIssued ? INVOICE_WIDGET_KEY[branch].issued : INVOICE_WIDGET_KEY[branch].notIssued) },
      { id: columns.attachment, type: "attachmentV2", value: entry.attachmentTokens },
    );
    return items;
  });

  return [
    { id: WIDGET.reason, type: "textarea", value: input.reason },
    { id: WIDGET.department, type: "radioV2", value: COST_PAYMENT_DEPARTMENT_CLOUD },
    { id: WIDGET.company, type: "radioV2", value: input.companyKey },
    { id: WIDGET.project, type: "radioV2", value: PROJECT_KEY[branch] },
    { id: LIST_WIDGET[branch], type: "fieldList", value: rows },
  ];
}

/** 提交前的完整校验，返回第一条错误信息；没问题返回空串。 */
export function validateCostPaymentEntries(branch: CostPaymentBranch, entries: CostPaymentEntryInput[]) {
  if (!entries.length) return "至少需要一条付款明细";
  const companyKeys = new Set(
    entries.map((entry) => String(entry.companyKey ?? "").trim() || resolveCostPaymentCompanyKey(entry.undertakingUnitCode)),
  );
  if (companyKeys.size > 1) return "所选单据的承接单位不一致，请分开发起付款申请";
  if (![...companyKeys][0]) return "承接单位在飞书审批里没有对应的公司选项（例如阿根廷主体），请先补选项";
  for (const [index, entry] of entries.entries()) {
    const label = `第 ${index + 1} 行`;
    if (!(Number(entry.amount) > 0)) return `${label} 金额必须大于 0`;
    if (!String(entry.currency ?? "").trim()) return `${label} 缺少币种`;
    if (!String(entry.payee ?? "").trim()) return `${label} 缺少收款单位（供应商默认银行账户）`;
    if (!String(entry.bankAccount ?? "").trim()) return `${label} 缺少银行账户`;
    if (!String(entry.bankName ?? "").trim()) return `${label} 缺少开户行`;
    if (!String(entry.swiftCode ?? "").trim()) return `${label} 缺少 SWIFT CODE`;
    if (!String(entry.paymentDate ?? "").trim()) return `${label} 缺少需求付款日期`;
    const paymentDate = String(entry.paymentDate).slice(0, 10);
    const today = toShanghaiDate(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && paymentDate < today) {
      return `${label} 预计付款日期不能早于今天（${today}），请调整后再提交`;
    }
    if (branch === "huawei" && !String(entry.customerOptionKey ?? "").trim() && !resolveCostPaymentCustomerKey(entry.customerName)) {
      return `${label} 客户名称没有对应的审批选项`;
    }
    if (branch === "compute" && !String(entry.orderNo ?? "").trim()) return `${label} 缺少订单号`;
  }
  return "";
}

/** 读集采发票附件（发起时自动带出）。 */
async function loadSettlementInvoiceAttachmentTokens(invoiceId: string) {
  const rows = await queryRows<StoredFileRow>(
    `SELECT id, fileName, fileType, dataUrl, storageProvider, storageKey
       FROM merge_po_settlement_attachments WHERE invoiceId = :invoiceId ORDER BY uploadedAt`,
    { invoiceId },
  );
  return uploadStoredFiles(rows);
}

type StoredFileRow = {
  fileName?: string | null;
  fileType?: string | null;
  dataUrl?: string | null;
  storageProvider?: string | null;
  storageKey?: string | null;
};

async function uploadStoredFiles(rows: StoredFileRow[]) {
  const tokens: string[] = [];
  for (const row of rows) {
    const file = await readStoredFile(row);
    if (!file) continue;
    tokens.push(await uploadApprovalAttachment({ bytes: file.bytes, fileName: row.fileName || "attachment.pdf" }));
  }
  return tokens;
}

/** 把「已有附件引用」解析回原文件并上传到飞书审批。 */
async function uploadAttachmentRefs(entry: CostPaymentEntryInput) {
  const refs = Array.from(
    new Map((entry.attachmentRefs ?? []).map((ref) => [`${ref.source}:${ref.attachmentId}`, ref])).values(),
  );
  const tokens: string[] = [];
  for (const ref of refs) {
    let rows: Row[] = [];
    if (ref.source === "purchase_order") {
      rows = await queryRows<Row>(
        `SELECT * FROM merge_common_attachments
          WHERE attachmentId = :attachmentId AND ownerType = 'purchase-orders' AND ownerId = :ownerId LIMIT 1`,
        { attachmentId: ref.attachmentId, ownerId: entry.ownerId },
      );
    } else if (ref.source === "settlement_invoice") {
      rows = await queryRows<Row>(
        `SELECT * FROM merge_po_settlement_attachments
          WHERE id = :attachmentId AND invoiceId = :ownerId LIMIT 1`,
        { attachmentId: ref.attachmentId, ownerId: entry.ownerId },
      );
    } else if (ref.source === "settlement_project") {
      rows = await queryRows<Row>(
        `SELECT * FROM merge_po_settlement_attachments
          WHERE id = :attachmentId AND projectId = :projectId AND invoiceId IS NULL LIMIT 1`,
        { attachmentId: ref.attachmentId, projectId: String(entry.projectId ?? "") },
      );
    } else if (ref.source === "cloud_supplier_payment") {
      const paymentOwnerIds = cloudPaymentAttachmentOwnerIds(entry);
      rows = await queryRows<Row>(
        `SELECT * FROM merge_cloud_attachments
          WHERE id = :attachmentId AND ownerType = 'supplier_payment' AND ownerId IN (:paymentOwnerIds) LIMIT 1`,
        { attachmentId: ref.attachmentId, paymentOwnerIds },
      );
    } else if (ref.source === "cloud_invoice") {
      rows = await queryRows<Row>(
        `SELECT a.* FROM merge_cloud_attachments a
           INNER JOIN merge_cloud_rows r ON r.id = a.ownerId
          WHERE a.id = :attachmentId AND a.ownerType = 'invoice'
            AND r.period = :period AND r.supplierId = :supplierId LIMIT 1`,
        {
          attachmentId: ref.attachmentId,
          period: String(entry.period ?? ""),
          supplierId: String(entry.supplierId ?? ""),
        },
      );
    }
    if (!rows[0]) throw new Error(`附件不存在或不属于当前单据：${ref.attachmentId}`);
    const file = await readStoredFile(rows[0] as StoredFileRow);
    if (!file) throw new Error(`附件内容不存在：${String(rows[0].fileName ?? ref.attachmentId)}`);
    tokens.push(await uploadApprovalAttachment({
      bytes: file.bytes,
      fileName: String(rows[0].fileName ?? "attachment.pdf"),
    }));
  }
  return tokens;
}

/** 把弹层里新上传的 dataUrl 附件上传到飞书审批附件，返回 file_token。 */
async function uploadInlineAttachments(attachments: Array<{ fileName: string; dataUrl: string }>) {
  const tokens: string[] = [];
  for (const attachment of attachments) {
    const match = /^data:([^;,]+)?;base64,([\s\S]*)$/.exec(String(attachment.dataUrl ?? ""));
    if (!match) continue;
    tokens.push(await uploadApprovalAttachment({ bytes: Buffer.from(match[2], "base64"), fileName: attachment.fileName || "attachment.pdf" }));
  }
  return tokens;
}

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

/** 发起审批：上传附件 → 组装表单 → 提交 → 记台账 → 回写来源单据状态。 */
export async function submitCostPaymentApproval(input: {
  branch: CostPaymentBranch;
  reason: string;
  entries: CostPaymentEntryInput[];
  starter: { openId: string; userId?: string; displayName?: string };
}) {
  const openId = String(input.starter.openId ?? "").trim();
  if (!openId.startsWith("ou_")) throw new Error("当前账号没有绑定飞书 open_id，无法发起审批");
  const validationError = validateCostPaymentEntries(input.branch, input.entries);
  if (validationError) throw new Error(validationError);

  const companyKey =
    String(input.entries[0].companyKey ?? "").trim() || resolveCostPaymentCompanyKey(input.entries[0].undertakingUnitCode);
  const formEntries = [];
  const savedAttachments: Array<{ ownerId: string; fileName: string; dataUrl: string; fileType: string }> = [];
  for (const entry of input.entries) {
    const existing = !Array.isArray(entry.attachmentRefs) && entry.ownerType === "settlement_invoice_payment"
      ? await loadSettlementInvoiceAttachmentTokens(entry.ownerId)
      : [];
    const referenced = await uploadAttachmentRefs(entry);
    const uploaded = await uploadInlineAttachments(entry.attachments ?? []);
    const tokens = [...existing, ...referenced, ...uploaded];
    if (!tokens.length) throw new Error(`明细 ${entry.ownerNo ?? entry.ownerId} 缺少附件，付款申请必须带附件`);
    for (const attachment of entry.attachments ?? []) {
      const match = /^data:([^;,]+)?;base64,/.exec(String(attachment.dataUrl ?? ""));
      savedAttachments.push({
        ownerId: entry.ownerId,
        fileName: attachment.fileName || "attachment.pdf",
        dataUrl: attachment.dataUrl,
        fileType: match?.[1] ?? "application/octet-stream",
      });
    }
    formEntries.push({
      amount: Number(entry.amount),
      currency: String(entry.currency).trim().toUpperCase(),
      payee: String(entry.payee).trim(),
      bankAccount: String(entry.bankAccount).trim(),
      bankName: String(entry.bankName).trim(),
      swiftCode: String(entry.swiftCode).trim(),
      feeKey: entry.feeKey ?? "none",
      feeOptionValue: entry.feeOptionKey,
      invoiceOptionValue: entry.invoiceOptionKey,
      paymentDate: String(entry.paymentDate).slice(0, 10),
      invoiceIssued: Boolean(entry.invoiceIssued),
      customerKey: input.branch === "huawei" ? String(entry.customerOptionKey ?? "").trim() || resolveCostPaymentCustomerKey(entry.customerName) : undefined,
      orderNo: entry.orderNo,
      batchNo: entry.batchNo,
      attachmentTokens: tokens,
    });
  }

  const form = buildCostPaymentForm(input.branch, { reason: input.reason, companyKey, entries: formEntries });
  const created = await callFeishu<{ instance_code?: string }>(
    "/open-apis/approval/v4/instances",
    { method: "POST", body: JSON.stringify({ approval_code: COST_PAYMENT_APPROVAL_CODE, open_id: openId, form: JSON.stringify(form) }) },
    "发起飞书审批",
  );
  const instanceCode = String(created?.instance_code ?? "").trim();
  if (!instanceCode) throw new Error("飞书未返回审批实例 code");

  const approvalId = randomUUID();
  const ownerIds = input.entries.map((entry) => entry.ownerId);
  await execute(
    `INSERT INTO merge_common_feishu_approvals
       (id, ownerType, ownerId, ownerNo, period, approvalCode, instanceCode, title, status,
        starterOpenId, starterUserId, starterName, allocationSourceIds, formJson, submittedAt)
     VALUES
       (:id, :ownerType, :ownerId, :ownerNo, :period, :approvalCode, :instanceCode, :title, 'pending',
        :starterOpenId, :starterUserId, :starterName, :allocationSourceIds, :formJson, CURRENT_TIMESTAMP)`,
    {
      id: approvalId,
      ownerType: input.entries[0].ownerType,
      ownerId: input.entries[0].ownerId,
      ownerNo: input.entries.map((entry) => entry.ownerNo ?? entry.ownerId).join(",").slice(0, 128),
      period: input.entries[0].period ?? null,
      approvalCode: COST_PAYMENT_APPROVAL_CODE,
      instanceCode,
      title: input.reason.slice(0, 255),
      starterOpenId: openId,
      starterUserId: input.starter.userId ?? null,
      starterName: input.starter.displayName ?? null,
      allocationSourceIds: ownerIds.join(",").slice(0, 500),
      formJson: JSON.stringify(form),
    },
  );

  await markCostPaymentPending(input.entries.map((entry) => ({ ownerType: entry.ownerType, ownerId: entry.ownerId })), approvalId);
  // 弹层里上传的附件同时存成来源单据的附件，采购订单详情页也能看到。
  for (const attachment of savedAttachments) {
    await saveAttachmentForOwner(attachment.ownerId, attachment.fileName, attachment.fileType, attachment.dataUrl);
  }
  return { approvalId, instanceCode };
}

/**
 * 华为云的来源行按「账期 + 供应商」更新（列表用的是合成 id，见
 * `parseCloudSupplierPaymentOwnerId`）；传进来的如果不是合成 id 就退回按物理 id 更新。
 */
async function updateCloudSupplierPayment(ownerId: string, patch: { approvalId: string; paid?: number; paymentDate?: string }) {
  const assignments = ["paymentApprovalId = :approvalId"];
  if (patch.paid) assignments.push("paid = 1");
  if (patch.paymentDate) assignments.push("paymentDate = :paymentDate");
  const values = {
    approvalId: patch.approvalId,
    ...(patch.paymentDate ? { paymentDate: patch.paymentDate } : {}),
  };
  const parsed = parseCloudSupplierPaymentOwnerId(ownerId);
  if (!parsed) {
    await execute(
      `UPDATE merge_cloud_supplier_payments
          SET ${assignments.join(", ")}
        WHERE id = :ownerId`,
      { ...values, ownerId },
    );
    return;
  }
  await execute(
    `UPDATE merge_cloud_supplier_payments
        SET ${assignments.join(", ")}
      WHERE period = :period AND supplierId = :supplierId`,
    { ...values, ...parsed },
  );
}

async function markCostPaymentPending(entries: Array<{ ownerType: CostPaymentOwnerType; ownerId: string }>, approvalId: string) {
  for (const entry of entries) {
    if (entry.ownerType === "purchase_order_payment") {
      await execute("UPDATE merge_power_purchaseorders SET paymentStatus = '审批中', paymentApprovalId = :approvalId WHERE purchaseOrderId = :ownerId", { approvalId, ownerId: entry.ownerId });
    } else if (entry.ownerType === "cloud_supplier_payment") {
      await updateCloudSupplierPayment(entry.ownerId, { approvalId });
    } else {
      await execute("UPDATE merge_po_settlement_invoices SET paymentApprovalId = :approvalId WHERE id = :ownerId", { approvalId, ownerId: entry.ownerId });
    }
  }
}

/** 新上传的附件存进通用附件表，采购订单详情页可以下载。 */
async function saveAttachmentForOwner(ownerId: string, fileName: string, fileType: string, dataUrl: string) {
  const attachmentId = randomUUID();
  const bytes = Buffer.from(String(dataUrl).replace(/^data:[^;]*;base64,/, ""), "base64");
  await execute(
    `INSERT INTO merge_common_attachments
       (attachmentId, ownerType, ownerId, fileName, fileType, fileSize, dataUrl, storageProvider, uploadedAt)
     VALUES
       (:attachmentId, 'purchase-orders', :ownerId, :fileName, :fileType, :fileSize, :dataUrl, 'db', CURRENT_TIMESTAMP)`,
    { attachmentId, ownerId, fileName: fileName.slice(0, 255), fileType, fileSize: bytes.length, dataUrl },
  );
}

/** Only unfinished approvals or failed backfills; completed historical payments leave the queue. */
export async function syncCostPaymentApprovals(limit = 30, dueOnly = false) {
  const batchLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 30;
  const rows = await queryRows<{ id: string; instanceCode: string; status: string; syncError: string; ownerType: CostPaymentOwnerType; ownerId: string; allocationSourceIds: string | null }>(
    `SELECT id, instanceCode, status, syncError, ownerType, ownerId, allocationSourceIds
       FROM merge_common_feishu_approvals
      WHERE approvalCode = :approvalCode AND (status IN ('pending', 'returned') OR NULLIF(syncError, '') IS NOT NULL)
        ${dueOnly ? "AND (lastSyncedAt IS NULL OR lastSyncedAt <= TIMESTAMPADD(SECOND, -60, CURRENT_TIMESTAMP))" : ""}
      ORDER BY COALESCE(lastSyncedAt, submittedAt) ASC LIMIT ${batchLimit}`,
    { approvalCode: COST_PAYMENT_APPROVAL_CODE },
  );
  const results: Array<{ instanceCode: string; status: string; changed: boolean }> = [];
  const errors: Array<{ instanceCode: string; error: string }> = [];
  for (const row of rows) {
    try {
    const remote = await fetchInvoiceApprovalInstance(row.instanceCode);
    const changed = remote.status !== row.status;
    // Backfill before advancing the ledger to a terminal state, so a failed write remains retryable.
    if (changed || remote.paymentConfirmedAt || row.syncError) await applyCostPaymentStatus(row.ownerType, approvalOwnerIds(row), remote.status, row.id, remote.paymentConfirmedAt);
    await execute(
      `UPDATE merge_common_feishu_approvals
          SET status = :status, remoteStatus = :remoteStatus, serialNumber = :serialNumber,
              rejectReason = :rejectReason, finishedAt = :finishedAt,
              paymentConfirmedAt = COALESCE(:paymentConfirmedAt, paymentConfirmedAt),
              paymentConfirmedNode = CASE WHEN :paymentConfirmedNode <> '' THEN :paymentConfirmedNode ELSE paymentConfirmedNode END,
              lastSyncedAt = CURRENT_TIMESTAMP, syncError = ''
        WHERE instanceCode = :instanceCode`,
      {
        status: remote.status,
        remoteStatus: remote.remoteStatus,
        serialNumber: remote.serialNumber,
        rejectReason: remote.rejectReason,
        finishedAt: remote.finishedAt,
        paymentConfirmedAt: remote.paymentConfirmedAt,
        paymentConfirmedNode: remote.paymentConfirmedNode,
        instanceCode: row.instanceCode,
      },
    );
    results.push({ instanceCode: row.instanceCode, status: remote.status, changed });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ instanceCode: row.instanceCode, error: message });
      await execute("UPDATE merge_common_feishu_approvals SET syncError = :message, lastSyncedAt = CURRENT_TIMESTAMP WHERE instanceCode = :instanceCode", {
        instanceCode: row.instanceCode, message: message.slice(0, 500),
      });
    }
  }
  return { total: rows.length, results, errors };
}

function approvalOwnerIds(row: { ownerId?: string | null; allocationSourceIds?: string | null }) {
  return Array.from(new Set([
    ...String(row.allocationSourceIds ?? "").split(","),
    String(row.ownerId ?? ""),
  ].map((value) => value.trim()).filter(Boolean)));
}

/** 飞书节点时间是 UTC 毫秒，业务表只存东八区日期。 */
export function toShanghaiDate(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function applyCostPaymentStatus(
  ownerType: CostPaymentOwnerType,
  ownerIds: string[],
  status: string,
  approvalId: string,
  paymentConfirmedAt: Date | null,
) {
  const approved = status === "approved";
  const paidDate = toShanghaiDate(paymentConfirmedAt);
  const paid = approved || Boolean(paidDate);
  const paymentStatus = paid
    ? "已付款"
    : status === "returned"
      ? "已退回"
      : status === "rejected"
        ? "已驳回"
        : status === "canceled"
          ? "已撤回"
          : "审批中";
  for (const ownerId of ownerIds) {
    if (ownerType === "purchase_order_payment") {
      await execute(
        `UPDATE merge_power_purchaseorders
            SET paymentStatus = :paymentStatus,
                paidAt = CASE WHEN :paidDate <> '' THEN :paidDate ELSE paidAt END
          WHERE purchaseOrderId = :ownerId`,
        { paymentStatus, paidDate, ownerId },
      );
    } else if (ownerType === "cloud_supplier_payment") {
      await updateCloudSupplierPayment(ownerId, {
        approvalId,
        ...(paid ? { paid: 1 } : {}),
        ...(paidDate ? { paymentDate: paidDate } : {}),
      });
    } else {
      await execute(
        `UPDATE merge_po_settlement_invoices
            SET isPaid = CASE WHEN :paidDate <> '' THEN 1 WHEN :approved = 1 THEN 1 ELSE isPaid END,
                actualReceiptDate = CASE WHEN :paidDate <> '' THEN :paidDate ELSE actualReceiptDate END,
                paymentApprovalId = :approvalId
          WHERE id = :ownerId`,
        { approvalId, approved: approved ? 1 : 0, paidDate, ownerId },
      );
    }
  }
}

/** 已通过但历史同步没记录到账节点的审批，按需回填一次。 */
export async function backfillCostPaymentConfirmedAt(limit = 50) {
  const rows = await queryRows<{
    id: string; instanceCode: string; ownerType: CostPaymentOwnerType; ownerId: string; allocationSourceIds: string | null;
  }>(
    `SELECT id, instanceCode, ownerType, ownerId, allocationSourceIds
       FROM merge_common_feishu_approvals
      WHERE approvalCode = :approvalCode
        AND status = 'approved'
        AND paymentConfirmedAt IS NULL
      ORDER BY finishedAt ASC
      LIMIT ${Math.max(1, Math.floor(limit))}`,
    { approvalCode: COST_PAYMENT_APPROVAL_CODE },
  );
  const result = { checked: rows.length, updated: 0, skipped: 0, errors: [] as Array<{ instanceCode: string; error: string }> };
  for (const row of rows) {
    try {
      const remote = await fetchInvoiceApprovalInstance(row.instanceCode);
      if (!remote.paymentConfirmedAt) {
        result.skipped += 1;
        continue;
      }
      await execute(
        `UPDATE merge_common_feishu_approvals
            SET paymentConfirmedAt = :paymentConfirmedAt,
                paymentConfirmedNode = :paymentConfirmedNode,
                lastSyncedAt = CURRENT_TIMESTAMP
          WHERE instanceCode = :instanceCode`,
        {
          paymentConfirmedAt: remote.paymentConfirmedAt,
          paymentConfirmedNode: remote.paymentConfirmedNode,
          instanceCode: row.instanceCode,
        },
      );
      await applyCostPaymentStatus(row.ownerType, approvalOwnerIds(row), "approved", row.id, remote.paymentConfirmedAt);
      result.updated += 1;
    } catch (error) {
      result.errors.push({ instanceCode: row.instanceCode, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

/**
 * 华为云供应商付款的列表用的是合成 id：`账期::供应商ID`（一个账期一个供应商一行），
 * 和表里的物理 id 不是一回事，所以这里统一按「账期 + 供应商」定位来源行。
 */
export function parseCloudSupplierPaymentOwnerId(ownerId: unknown) {
  const parts = String(ownerId ?? "").split("::");
  if (parts.length < 2) return null;
  const period = parts[0].trim();
  const supplierId = parts.slice(1).join("::").trim();
  if (!period || !supplierId) return null;
  return { period, supplierId };
}

/** 飞书审批定义里的一个控件。 */
type ApprovalWidget = {
  id?: string;
  name?: string;
  type?: string;
  required?: boolean;
  option?: Array<{ value?: string; text?: string }> | { currencyRange?: string[] } | null;
  children?: ApprovalWidget[];
};

export type CostPaymentOption = { value: string; text: string };

/** 从飞书审批定义解析出来的可选项（供前端下拉直接用）。 */
export type CostPaymentBranchOptions = {
  /** 成本公司选项（按审批里的顺序）。 */
  company: CostPaymentOption[];
  /** 客户名称选项（只有华为云分支有）。 */
  customer: CostPaymentOption[];
  fee: CostPaymentOption[];
  invoice: CostPaymentOption[];
  /** 金额控件允许的币种。 */
  currencies: string[];
};

const APPROVAL_OPTIONS_CACHE_MS = 10 * 60 * 1000;
let approvalOptionsCache: { at: number; value: Record<CostPaymentBranch, CostPaymentBranchOptions> } | null = null;
let approvalOptionsPromise: Promise<Record<CostPaymentBranch, CostPaymentBranchOptions>> | null = null;

/** 内置兜底（飞书读不到时用，值与审批定义一致）。 */
function builtinOptions(): Record<CostPaymentBranch, CostPaymentBranchOptions> {
  const company = Object.entries(COMPANY_KEY_BY_UNIT_CODE).map(([, value]) => ({ value, text: value }));
  const build = (branch: CostPaymentBranch, extras?: { customer?: CostPaymentOption[] }): CostPaymentBranchOptions => ({
    company,
    customer: extras?.customer ?? [],
    fee: Object.entries(FEE_WIDGET_KEY[branch]).map(([key, value]) => ({ value, text: key })),
    invoice: [INVOICE_WIDGET_KEY[branch].issued, INVOICE_WIDGET_KEY[branch].notIssued].map((value) => ({ value, text: value })),
    currencies: ["BRL", "CLP", "CNY", "MXN", "USD"],
  });
  return {
    huawei: build("huawei", { customer: Object.entries(CUSTOMER_WIDGET_KEY).map(([key, value]) => ({ value, text: key })) }),
    other: build("other"),
    compute: build("compute"),
  };
}

function readOptions(widget: ApprovalWidget | undefined): CostPaymentOption[] {
  if (!Array.isArray(widget?.option)) return [];
  return widget.option
    .map((item) => ({ value: String(item?.value ?? ""), text: String(item?.text ?? "") }))
    .filter((item) => item.value);
}

function findWidget(widgets: ApprovalWidget[] | undefined, name: string): ApprovalWidget | undefined {
  return (widgets ?? []).find((widget) => widget.name === name);
}

/**
 * 从飞书审批定义读可选项（**不写死**）：审批里加了新选项（客户名称、手续费、币种等），
 * 系统下拉会自动跟着出现，不用改代码。读不到时回落到内置列表。
 */
export async function loadCostPaymentApprovalOptions(force = false) {
  if (!force && approvalOptionsCache && Date.now() - approvalOptionsCache.at < APPROVAL_OPTIONS_CACHE_MS) {
    return approvalOptionsCache.value;
  }
  if (!approvalOptionsPromise) {
    approvalOptionsPromise = (async () => {
      const data = await callFeishu<{ form?: string }>(
        `/open-apis/approval/v4/approvals/${encodeURIComponent(COST_PAYMENT_APPROVAL_CODE)}`,
        {},
        "读取审批定义",
      );
      const widgets = JSON.parse(String(data?.form ?? "[]")) as ApprovalWidget[];
      const company = readOptions(findWidget(widgets, "成本公司"));
      const parseBranch = (branch: CostPaymentBranch, listName: string) => {
        const list = findWidget(widgets, listName);
        const children = list?.children ?? [];
        const amount = findWidget(children, "金额");
        const currencyRange = (!Array.isArray(amount?.option) && amount?.option?.currencyRange) || [];
        return {
          company,
          customer: branch === "huawei" ? readOptions(findWidget(children, "客户名称")) : [],
          fee: readOptions(findWidget(children, "手续费")),
          invoice: readOptions(findWidget(children, "发票")),
          currencies: Array.isArray(currencyRange) && currencyRange.length ? [...currencyRange] : ["BRL", "CLP", "CNY", "MXN", "USD"],
        } satisfies CostPaymentBranchOptions;
      };
      const value = {
        huawei: parseBranch("huawei", "付款明细-华为云"),
        other: parseBranch("other", "付款明细-其他"),
        compute: parseBranch("compute", "付款明细-算力"),
      };
      approvalOptionsCache = { at: Date.now(), value };
      return value;
    })()
      .catch(() => {
        // 飞书读不到就用内置兜底，不能因为审批定义读不到就让整个弹层打不开
        const fallback = builtinOptions();
        approvalOptionsCache = { at: Date.now(), value: fallback };
        return fallback;
      })
      .finally(() => {
        approvalOptionsPromise = null;
      });
  }
  return approvalOptionsPromise;
}

export type CostPaymentPreviewRow = {
  ownerId: string;
  ownerNo: string;
  period: string;
  supplierId: string;
  supplierName: string;
  supplierFullName: string;
  undertakingUnitCode: string;
  undertakingUnitName: string;
  amount: number;
  currency: string;
  payee: string;
  bankName: string;
  bankAccount: string;
  swiftCode: string;
  paymentDate: string;
  invoiceIssued: boolean;
  customerName: string;
  /** 华为云：这次付款覆盖的客户 / 华为云账号（来自对账账单）。 */
  sources: Array<{ customer: string; account: string; amount: number }>;
  orderNo: string;
  batchNo: string;
  projectId: string;
  projectNo: string;
  projectName: string;
  countryCode: string;
  countryName: string;
  quantity: number;
  requestNos: string[];
  /** 供应商付款/采购订单附件的归属 ID。 */
  attachmentOwnerId: string;
  attachmentOptions: CostPaymentAttachmentOption[];
  paid: boolean;
  bankAccounts: Array<{ accountId: string; accountName: string; bankName: string; bankAccount: string; swiftCode: string; currency: string; isDefault: boolean }>;
};

/**
 * 发起弹层用的预填数据：按分支把「金额 / 供应商默认账户 / 批次号 / 日期」一次性带出来。
 * 三个入口的弹层都调这个接口，前端不需要各自拼字段。
 */
export async function loadCostPaymentPreview(branch: CostPaymentBranch, ownerIds: string[]) {
  const ids = ownerIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!ids.length) throw new Error("请先选择要发起付款申请的单据");

  const sourceRows = branch === "huawei"
    ? await queryRows<Row>(
        `SELECT CONCAT(p.period, '::', p.supplierId) AS ownerId, p.id AS physicalId, p.period AS ownerNo, p.period, p.supplierId, p.supplierName,
                COALESCE(NULLIF(s.nameCn, ''), NULLIF(s.nameEn, ''), p.supplierName) AS supplierFullName,
                -- 金额优先取已登记的付款总额，没登记就按账单汇总（供应商应付含税）
                COALESCE(
                  NULLIF(p.paymentTotalAmount, 0),
                  (SELECT SUM(r.supplierPayableTotalAmount) FROM merge_cloud_rows r
                    WHERE r.period = p.period AND r.supplierId = p.supplierId),
                  p.supplierPayableTotalAmount,
                  0
                ) AS amount,
                COALESCE(NULLIF(p.currency, ''), NULLIF(p.supplierPayableCurrency, ''), 'USD') AS currency,
                p.receivableDate AS paymentDate, p.paid, p.invoiceNo,
                (SELECT u.undertakingUnitCode FROM merge_common_undertaking_units u
                  WHERE u.undertakingUnitId = p.payerUnitId OR u.undertakingUnitCode = p.payerUnitName LIMIT 1) AS undertakingUnitCode,
                COALESCE(
                  (SELECT COALESCE(NULLIF(u.shortName, ''), u.entityName, u.name) FROM merge_common_undertaking_units u
                    WHERE u.undertakingUnitId = p.payerUnitId OR u.undertakingUnitCode = p.payerUnitName LIMIT 1),
                  p.payerUnitName
                ) AS undertakingUnitName,
                -- 服务映射一个供应商可能对应多个客户，这里只取一个，避免把付款行放大成多行
                (SELECT MAX(m.customerName) FROM merge_cloud_mappings m
                  WHERE m.supplierId = p.supplierId AND m.undertakingUnitId = p.payerUnitId LIMIT 1) AS customerName
           FROM merge_cloud_supplier_payments p
           LEFT JOIN merge_common_suppliers s ON s.supplierId = p.supplierId OR s.supplierCode = p.supplierId
          WHERE CONCAT(p.period, '::', p.supplierId) IN (:ids) OR p.id IN (:ids)`,
        { ids },
      )
    : branch === "other"
      ? await queryRows<Row>(
          `SELECT i.id AS ownerId, i.invoiceNo AS ownerNo, i.accountPeriod AS period, i.invoiceEntityId AS supplierId,
                  i.invoiceEntity AS supplierName,
                  COALESCE(NULLIF(sup.nameCn, ''), NULLIF(sup.nameEn, ''), i.invoiceEntity) AS supplierFullName,
                  i.projectId, p.projectNo, p.projectName,
                  COALESCE(i.invoiceTotal, 0) AS amount, COALESCE(NULLIF(i.currency, ''), 'CNY') AS currency,
                  COALESCE(i.receivableDate, i.accountingDate, i.invoiceDate) AS paymentDate, i.isPaid AS paid, i.isInvoiced,
                  u.undertakingUnitCode, COALESCE(NULLIF(u.shortName, ''), u.entityName, i.companyEntity) AS undertakingUnitName,
                  NULL AS customerName
             FROM merge_po_settlement_invoices i
             LEFT JOIN merge_po_settlement_projects p ON p.id = i.projectId
             LEFT JOIN merge_common_suppliers sup ON sup.supplierId = i.invoiceEntityId OR sup.supplierCode = i.invoiceEntityId
             LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = i.companyEntityId
            WHERE i.id IN (:ids) AND i.type = 'cost'`,
          { ids },
        )
      : await queryRows<Row>(
          `SELECT po.purchaseOrderId AS ownerId, po.poNo AS ownerNo, DATE_FORMAT(MIN(ri.requestedAt), '%Y-%m-%d') AS period,
                  MIN(ri.supplierId) AS supplierId, MIN(s.shortName) AS supplierName,
                  MIN(COALESCE(NULLIF(s.nameCn, ''), NULLIF(s.nameEn, ''), s.shortName)) AS supplierFullName,
                  ROUND(SUM(ri.quantity * poi.unitPrice), 2) AS amount, COALESCE(MIN(po.currency), 'USD') AS currency,
                  po.paymentDate AS paymentDate, po.paymentStatus AS paid, po.invoiceStatus, po.invoiceNo,
                  MIN(u.undertakingUnitCode) AS undertakingUnitCode, MIN(COALESCE(NULLIF(u.shortName, ''), u.entityName)) AS undertakingUnitName,
                  GROUP_CONCAT(DISTINCT COALESCE(NULLIF(ri.batchName, ''), NULLIF(req.batchName, '')) ORDER BY ri.batchName SEPARATOR '、') AS batchNo,
                  MIN(req.countryCode) AS countryCode, MIN(c.nameZh) AS countryName,
                  SUM(ri.quantity) AS quantity,
                  GROUP_CONCAT(DISTINCT ri.requestNo ORDER BY ri.requestNo SEPARATOR ',') AS requestNos
             FROM merge_power_purchaseorders po
             LEFT JOIN merge_power_purchaseorderitems poi ON poi.purchaseOrderId = po.purchaseOrderId
             LEFT JOIN merge_power_requestitems ri ON ri.id = poi.requestItemId
             LEFT JOIN merge_power_requests req ON req.requestNo = ri.requestNo
             LEFT JOIN merge_power_countries c ON c.code = req.countryCode
             LEFT JOIN merge_common_suppliers s ON s.supplierId = ri.supplierId
             LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = ri.undertakingUnitId
            WHERE po.purchaseOrderId IN (:ids)
            GROUP BY po.purchaseOrderId`,
          { ids },
        );

  /** 可选项优先取飞书审批定义里的（后台加了新选项，下拉自动跟着变）。 */
  const branchOptions = (await loadCostPaymentApprovalOptions())[branch];
  const found = new Set<string>();
  for (const row of sourceRows) {
    found.add(String(row.ownerId ?? ""));
    if (row.physicalId) found.add(String(row.physicalId));
  }
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`有 ${missing.length} 条单据找不到或类型不符，请刷新后重试`);

  const supplierIds = Array.from(new Set(sourceRows.map((row) => String(row.supplierId ?? "").trim()).filter(Boolean)));
  const accounts = supplierIds.length
    ? await queryRows<Row>(
        `SELECT supplierId, accountId, accountName, bankName, bankAccount, swiftCode, currency, isDefault
           FROM merge_common_supplier_bank_accounts
          WHERE supplierId IN (:supplierIds)
          ORDER BY isDefault DESC, createdAt ASC`,
        { supplierIds },
      )
    : [];
  const accountsBySupplier = new Map<string, CostPaymentPreviewRow["bankAccounts"]>();
  for (const account of accounts) {
    const key = String(account.supplierId ?? "");
    const list = accountsBySupplier.get(key) ?? [];
    list.push({
      accountId: String(account.accountId ?? ""),
      accountName: String(account.accountName ?? ""),
      bankName: String(account.bankName ?? ""),
      bankAccount: String(account.bankAccount ?? ""),
      swiftCode: String(account.swiftCode ?? ""),
      currency: String(account.currency ?? ""),
      isDefault: Number(account.isDefault ?? 0) === 1,
    });
    accountsBySupplier.set(key, list);
  }

  /** 华为云：这笔付款覆盖的客户 / 华为云账号（来自对账账单），用于弹层展示「账号信息」。 */
  const sourcesByKey = new Map<string, CostPaymentPreviewRow["sources"]>();
  if (branch === "huawei") {
    const periods = Array.from(new Set(sourceRows.map((row) => String(row.period ?? "")).filter(Boolean)));
    const cloudSources = periods.length && supplierIds.length
      ? await queryRows<Row>(
          `SELECT period, supplierId, customer, account, COALESCE(supplierPayableTotalAmount, 0) AS amount
             FROM merge_cloud_rows
            WHERE period IN (:periods) AND supplierId IN (:supplierIds)
            ORDER BY customer, account`,
          { periods, supplierIds },
        )
      : [];
    for (const row of cloudSources) {
      const key = `${String(row.period ?? "")}::${String(row.supplierId ?? "")}`;
      const list = sourcesByKey.get(key) ?? [];
      list.push({
        customer: String(row.customer ?? ""),
        account: String(row.account ?? ""),
        amount: Number(row.amount ?? 0),
      });
      sourcesByKey.set(key, list);
    }
  }

  /**
   * 已有附件选项：只返回元数据，正式提交时再按引用读取原文件。
   * 三个入口分别从采购订单附件、项目结算附件、华为云附件的原表取数。
   */
  const purchaseAttachmentOptions = new Map<string, CostPaymentAttachmentOption[]>();
  const settlementInvoiceOptions = new Map<string, CostPaymentAttachmentOption[]>();
  const settlementProjectOptions = new Map<string, CostPaymentAttachmentOption[]>();
  const supplierPaymentOptions = new Map<string, CostPaymentAttachmentOption[]>();
  const cloudInvoiceOptions = new Map<string, CostPaymentAttachmentOption[]>();

  if (branch === "compute") {
    const purchaseOrderIds = Array.from(new Set(sourceRows.map((row) => String(row.ownerId ?? "")).filter(Boolean)));
    const attachments = purchaseOrderIds.length
      ? await queryRows<Row>(
          `SELECT attachmentId AS id, ownerId, fileName, fileSize, fileType, uploadedAt
             FROM merge_common_attachments
            WHERE ownerType = 'purchase-orders' AND ownerId IN (:purchaseOrderIds)
            ORDER BY uploadedAt DESC`,
          { purchaseOrderIds },
        )
      : [];
    for (const attachment of attachments) {
      const key = String(attachment.ownerId ?? "");
      const list = purchaseAttachmentOptions.get(key) ?? [];
      list.push({
        id: String(attachment.id ?? ""),
        source: "purchase_order",
        sourceLabel: "采购订单附件",
        fileName: String(attachment.fileName ?? ""),
        fileSize: Number(attachment.fileSize ?? 0),
        fileType: String(attachment.fileType ?? ""),
        uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
      });
      purchaseAttachmentOptions.set(key, list);
    }
  } else if (branch === "other") {
    const invoiceIds = Array.from(new Set(sourceRows.map((row) => String(row.ownerId ?? "")).filter(Boolean)));
    const projectIds = Array.from(new Set(sourceRows.map((row) => String(row.projectId ?? "")).filter(Boolean)));
    const [invoiceAttachments, projectAttachments] = await Promise.all([
      invoiceIds.length
        ? queryRows<Row>(
            `SELECT id, invoiceId, fileName, fileSize, fileType, uploadedAt, description
               FROM merge_po_settlement_attachments
              WHERE invoiceId IN (:invoiceIds)
              ORDER BY uploadedAt DESC`,
            { invoiceIds },
          )
        : [],
      projectIds.length
        ? queryRows<Row>(
            `SELECT id, projectId, fileName, fileSize, fileType, uploadedAt, description
               FROM merge_po_settlement_attachments
              WHERE projectId IN (:projectIds) AND invoiceId IS NULL
              ORDER BY uploadedAt DESC`,
            { projectIds },
          )
        : [],
    ]);
    for (const attachment of invoiceAttachments) {
      const key = String(attachment.invoiceId ?? "");
      const list = settlementInvoiceOptions.get(key) ?? [];
      list.push({
        id: String(attachment.id ?? ""),
        source: "settlement_invoice",
        sourceLabel: "发票附件",
        fileName: String(attachment.fileName ?? ""),
        fileSize: Number(attachment.fileSize ?? 0),
        fileType: String(attachment.fileType ?? ""),
        uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
        description: String(attachment.description ?? "") || undefined,
      });
      settlementInvoiceOptions.set(key, list);
    }
    for (const attachment of projectAttachments) {
      const key = String(attachment.projectId ?? "");
      const list = settlementProjectOptions.get(key) ?? [];
      list.push({
        id: String(attachment.id ?? ""),
        source: "settlement_project",
        sourceLabel: "项目附件",
        fileName: String(attachment.fileName ?? ""),
        fileSize: Number(attachment.fileSize ?? 0),
        fileType: String(attachment.fileType ?? ""),
        uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
        description: String(attachment.description ?? "") || undefined,
      });
      settlementProjectOptions.set(key, list);
    }
  } else {
    const paymentOwnerKeyMap = new Map<string, string>();
    for (const row of sourceRows) {
      const canonicalKey = String(row.physicalId || row.ownerId || "");
      for (const ownerId of cloudPaymentAttachmentOwnerIds({
        ownerId: String(row.ownerId ?? ""),
        attachmentOwnerId: String(row.physicalId ?? ""),
        period: String(row.period ?? ""),
        supplierId: String(row.supplierId ?? ""),
      })) {
        paymentOwnerKeyMap.set(ownerId, canonicalKey);
      }
    }
    const paymentIds = [...paymentOwnerKeyMap.keys()];
    const periods = Array.from(new Set(sourceRows.map((row) => String(row.period ?? "")).filter(Boolean)));
    const cloudSupplierIds = Array.from(new Set(sourceRows.map((row) => String(row.supplierId ?? "")).filter(Boolean)));
    const [paymentAttachments, invoiceAttachments] = await Promise.all([
      paymentIds.length
        ? queryRows<Row>(
            `SELECT id, ownerId, fileName, fileSize, fileType, uploadedAt
               FROM merge_cloud_attachments
              WHERE ownerType = 'supplier_payment' AND ownerId IN (:paymentIds)
              ORDER BY uploadedAt DESC`,
            { paymentIds },
          )
        : [],
      periods.length && cloudSupplierIds.length
        ? queryRows<Row>(
            `SELECT a.id, a.fileName, a.fileSize, a.fileType, a.uploadedAt, r.period, r.supplierId
               FROM merge_cloud_attachments a
               INNER JOIN merge_cloud_rows r ON r.id = a.ownerId
              WHERE a.ownerType = 'invoice' AND r.period IN (:periods) AND r.supplierId IN (:cloudSupplierIds)
              ORDER BY a.uploadedAt DESC`,
            { periods, cloudSupplierIds },
          )
        : [],
    ]);
    for (const attachment of paymentAttachments) {
      const key = paymentOwnerKeyMap.get(String(attachment.ownerId ?? "")) ?? String(attachment.ownerId ?? "");
      const list = supplierPaymentOptions.get(key) ?? [];
      list.push({
        id: String(attachment.id ?? ""),
        source: "cloud_supplier_payment",
        sourceLabel: "供应商付款发票",
        fileName: String(attachment.fileName ?? ""),
        fileSize: Number(attachment.fileSize ?? 0),
        fileType: String(attachment.fileType ?? ""),
        uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
      });
      supplierPaymentOptions.set(key, list);
    }
    for (const attachment of invoiceAttachments) {
      const key = `${String(attachment.period ?? "")}::${String(attachment.supplierId ?? "")}`;
      const list = cloudInvoiceOptions.get(key) ?? [];
      list.push({
        id: String(attachment.id ?? ""),
        source: "cloud_invoice",
        sourceLabel: "客户开票附件",
        fileName: String(attachment.fileName ?? ""),
        fileSize: Number(attachment.fileSize ?? 0),
        fileType: String(attachment.fileType ?? ""),
        uploadedAt: attachment.uploadedAt ? String(attachment.uploadedAt) : null,
      });
      cloudInvoiceOptions.set(key, list);
    }
  }

  const rows: CostPaymentPreviewRow[] = sourceRows.map((row) => {
    const supplierId = String(row.supplierId ?? "");
    const bankAccounts = accountsBySupplier.get(supplierId) ?? [];
    const preferred = bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0];
    const paid = branch === "compute" ? String(row.paid ?? "") === "已付款" : Number(row.paid ?? 0) === 1;
    const projectId = String(row.projectId ?? "").trim();
    const attachmentOptions = branch === "compute"
      ? purchaseAttachmentOptions.get(String(row.ownerId ?? "")) ?? []
      : branch === "other"
        ? [...(settlementInvoiceOptions.get(String(row.ownerId ?? "")) ?? []), ...(settlementProjectOptions.get(projectId) ?? [])]
        : [
            ...(supplierPaymentOptions.get(String(row.physicalId ?? "")) ?? []),
            ...(cloudInvoiceOptions.get(`${String(row.period ?? "")}::${String(row.supplierId ?? "")}`) ?? []),
          ];
    return {
      ownerId: String(row.ownerId ?? ""),
      ownerNo: String(row.ownerNo ?? ""),
      period: String(row.period ?? ""),
      supplierId,
      supplierName: String(row.supplierName ?? "").trim(),
      supplierFullName: String(row.supplierFullName ?? row.supplierName ?? "").trim(),
      undertakingUnitCode: String(row.undertakingUnitCode ?? ""),
      undertakingUnitName: String(row.undertakingUnitName ?? ""),
      amount: Number(row.amount ?? 0),
      currency: String(row.currency ?? "").toUpperCase(),
      payee: preferred?.accountName ?? "",
      bankName: preferred?.bankName ?? "",
      bankAccount: preferred?.bankAccount ?? "",
      swiftCode: preferred?.swiftCode ?? "",
      paymentDate: String(branch === "other" && row.isInvoiced === 0 ? "" : row.paymentDate ?? "").slice(0, 10),
      invoiceIssued: branch === "other"
        ? Number(row.isInvoiced ?? 0) === 1
        : branch === "compute"
          ? ["已开票", "issued"].includes(String(row.invoiceStatus ?? "").trim())
          : Boolean(row.invoiceNo),
      customerName: String(row.customerName ?? ""),
      sources: branch === "huawei" ? sourcesByKey.get(`${String(row.period ?? "")}::${String(row.supplierId ?? "")}`) ?? [] : [],
      orderNo: String(row.ownerNo ?? ""),
      batchNo: String(row.batchNo ?? ""),
      projectId,
      projectNo: String(row.projectNo ?? "").trim(),
      projectName: String(row.projectName ?? "").trim(),
      countryCode: String(row.countryCode ?? "").trim(),
      countryName: String(row.countryName ?? "").trim(),
      quantity: Number(row.quantity ?? 0),
      requestNos: String(row.requestNos ?? "").split(",").map((value) => value.trim()).filter(Boolean),
      attachmentOwnerId: String(row.physicalId ?? row.ownerId ?? ""),
      attachmentOptions,
      paid,
      bankAccounts,
    };
  });
  return {
    branch,
    rows,
    options: branchOptions,
    companies: await loadCostPaymentCompanyOptions(branchOptions.company),
    warnings: rows.flatMap((row) => {
      const list: string[] = [];
      if (!row.bankAccounts.length) list.push(`${row.ownerNo || row.ownerId}：供应商还没有银行账户，请先在供应商档案里补`);
      if (row.paid) list.push(`${row.ownerNo || row.ownerId}：已标记为已付款`);
      if (branch === "huawei" && !resolveCostPaymentCustomerKey(row.customerName)) list.push(`${row.ownerNo || row.ownerId}：客户「${row.customerName || "未匹配"}」在审批里没有对应选项`);
      return list;
    }),
  };
}

/**
 * 成本公司下拉用：系统承接单位 + 对应的审批公司选项。
 *
 * 先按承接单位代码查内置映射；查不到时**用飞书里的公司选项文字做名称匹配**
 * （去掉空格标点、忽略括号里的国家后缀），这样审批后台新加了公司选项也能自动对上。
 * 两边都对不上时 companyKey 为空，弹层里会置灰并提示。
 */
export async function loadCostPaymentCompanyOptions(companyOptions: CostPaymentOption[] = []) {
  const rows = await queryRows<{ undertakingUnitCode: string | null; shortName: string | null; entityName: string | null }>(
    `SELECT undertakingUnitCode, shortName, entityName FROM merge_common_undertaking_units ORDER BY shortName`,
  );
  return rows.map((row) => {
    const code = String(row.undertakingUnitCode ?? "").trim().toUpperCase();
    const name = String(row.shortName ?? "").trim() || String(row.entityName ?? "").trim() || code;
    const companyKey = resolveCostPaymentCompanyKey(code) || matchCompanyOptionByName(companyOptions, [name, String(row.entityName ?? ""), code]);
    return { code, name, companyKey };
  });
}

export function matchCompanyOptionByName(options: CostPaymentOption[], candidates: string[]) {
  const normalized = (value: unknown) => String(value ?? "").toUpperCase().replace(/（[^）]*）|\([^)]*\)/g, "").replace(/[^A-Z0-9\u4e00-\u9fa5]/g, "");
  const candidatesNorm = candidates.map(normalized).filter((value) => value.length >= 3);
  if (!candidatesNorm.length) return "";
  let best: { value: string; length: number } | null = null;
  for (const option of options) {
    const optionNorm = normalized(option.text);
    if (!optionNorm) continue;
    for (const candidate of candidatesNorm) {
      if (!optionNorm.includes(candidate) && !candidate.includes(optionNorm)) continue;
      // 命中多个时取最"具体"（文字最短）的那个：LUZ NEWMEDIA 同时能命中 LUZ NEWMEDIA 与 LUZ NEWMEDIA, S.A. …
      if (!best || optionNorm.length < best.length) best = { value: option.value, length: optionNorm.length };
    }
  }
  return best?.value ?? "";
}

export type CostPaymentApprovalView = {
  approvalId: string;
  instanceCode: string;
  status: string;
  rejectReason: string;
  serialNumber: string;
  submittedAt: string;
  paymentConfirmedAt: string;
  paymentConfirmedNode: string;
  ownerIds: string[];
};

const OWNER_TYPE_BY_BRANCH: Record<CostPaymentBranch, CostPaymentOwnerType> = {
  huawei: "cloud_supplier_payment",
  other: "settlement_invoice_payment",
  compute: "purchase_order_payment",
};

async function listCostPaymentInstanceCodes(startTime = Date.now() - 365 * 86400000, endTime = Date.now()) {
  const token = await getFeishuTenantAccessToken();
  const codes: string[] = [];
  let pageToken = "";
  // 一年内可能有 500+ 条审批，不能只取前 5 页；找到单号前继续翻页。
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      approval_code: COST_PAYMENT_APPROVAL_CODE,
      page_size: "100",
      start_time: String(startTime),
      end_time: String(endTime),
    });
    if (pageToken) params.set("page_token", pageToken);
    const response = await fetch(`${FEISHU_API_BASE}/open-apis/approval/v4/instances?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({})) as {
      code?: number;
      msg?: string;
      data?: { has_more?: boolean; page_token?: string; instance_code_list?: string[] };
    };
    if (!response.ok || body.code !== 0) throw new Error(`查询审批实例列表失败：${body.msg ?? response.status}`);
    codes.push(...(body.data?.instance_code_list ?? []));
    if (!body.data?.has_more || !body.data?.page_token) break;
    pageToken = body.data.page_token;
  }
  return codes;
}

/**
 * 手动绑定只接受 v4 instance_code 或审批单号（serial_number）。
 * 分享短链里的 web InstanceID 不是 OpenAPI instance_code，不能直接绑定。
 */
async function resolveCostPaymentApprovalInstance(value: string) {
  const input = String(value ?? "").trim();
  if (!input) throw new Error("请填写审批单号或 instance_code");
  if (/^https?:\/\//i.test(input) || input.includes("go.feishu.cn/approval/s/")) {
    throw new Error("飞书分享短链不能直接绑定，请填写审批详情里的审批单号（如 202610160016）或 instance_code");
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)) {
    const remote = await fetchInvoiceApprovalInstance(input);
    return { instanceCode: input, remote };
  }

  // 审批单号前缀是日期（如 202610160016）。只查前后几天，避免为了一个单号扫几百条实例。
  const serialDate = /^(\d{4})(\d{2})(\d{2})\d+$/.exec(input);
  const center = serialDate ? Date.UTC(Number(serialDate[1]), Number(serialDate[2]) - 1, Number(serialDate[3])) : null;
  const searchCodes = async (codes: string[]) => {
    for (let index = 0; index < codes.length; index += 10) {
      const batch = codes.slice(index, index + 10);
      const details = await Promise.all(batch.map(async (code) => {
        try {
          return { code, remote: await fetchInvoiceApprovalInstance(code) };
        } catch {
          return null;
        }
      }));
      const matched = details.find((item) => item && (item.remote.serialNumber === input || item.code === input));
      if (matched) return { instanceCode: matched.code, remote: matched.remote };
    }
    return null;
  };
  if (center !== null) {
    const matched = await searchCodes(await listCostPaymentInstanceCodes(center - 3 * 86400000, center + 4 * 86400000));
    if (matched) return matched;
  }
  const matched = await searchCodes(await listCostPaymentInstanceCodes());
  if (matched) return matched;
  throw new Error(`没找到审批单号或 instance_code：${input}`);
}

function costPaymentApprovalTitle(formJson: string, fallback: string) {
  try {
    const form = JSON.parse(formJson) as Array<{ name?: string; value?: unknown }>;
    return String(form.find((item) => item.name === "付款事由")?.value ?? "").trim() || fallback;
  } catch {
    return fallback;
  }
}

/** 手动绑定外部发起的成本款付款审批，并立刻同步确认到账节点。 */
export async function bindCostPaymentApproval(input: {
  branch: CostPaymentBranch;
  ownerIds: string[];
  instanceCodeOrSerial: string;
}) {
  const ownerIds = Array.from(new Set(input.ownerIds.map((value) => String(value ?? "").trim()).filter(Boolean)));
  if (!ownerIds.length) throw new Error("请先选择需要绑定的付款单据");
  const { instanceCode, remote } = await resolveCostPaymentApprovalInstance(input.instanceCodeOrSerial);
  if (remote.approvalCode && remote.approvalCode !== COST_PAYMENT_APPROVAL_CODE) {
    throw new Error("这个审批实例不是「成本款付款申请」，不能绑定");
  }
  if (remote.approvalName && !remote.approvalName.includes("成本款付款")) {
    throw new Error(`这个审批实例是「${remote.approvalName}」，不是成本款付款申请`);
  }

  const preview = await loadCostPaymentPreview(input.branch, ownerIds);
  const first = preview.rows[0];
  const ownerType = OWNER_TYPE_BY_BRANCH[input.branch];
  const approvalId = randomUUID();
  const title = costPaymentApprovalTitle(remote.formJson, first?.ownerNo || "成本款付款申请");
  const ownerNo = preview.rows.map((row) => row.ownerNo || row.ownerId).join(",").slice(0, 128);
  const period = first?.period || null;
  const existing = await queryRows<{ id: string }>(
    "SELECT id FROM merge_common_feishu_approvals WHERE instanceCode = :instanceCode LIMIT 1",
    { instanceCode },
  );
  const savedId = existing[0]?.id || approvalId;
  if (existing[0]) {
    await execute(
      `UPDATE merge_common_feishu_approvals
          SET ownerType = :ownerType, ownerId = :ownerId, ownerNo = :ownerNo, period = :period,
              approvalCode = :approvalCode, title = :title, status = :status, remoteStatus = :remoteStatus,
              serialNumber = :serialNumber, starterOpenId = :starterOpenId, starterUserId = :starterUserId,
              allocationSourceIds = :allocationSourceIds, formJson = :formJson,
              finishedAt = :finishedAt, paymentConfirmedAt = COALESCE(:paymentConfirmedAt, paymentConfirmedAt),
              paymentConfirmedNode = CASE WHEN :paymentConfirmedNode <> '' THEN :paymentConfirmedNode ELSE paymentConfirmedNode END,
              lastSyncedAt = CURRENT_TIMESTAMP, syncError = ''
        WHERE id = :id`,
      {
        id: savedId,
        ownerType,
        ownerId: ownerIds[0],
        ownerNo: ownerNo || null,
        period,
        approvalCode: COST_PAYMENT_APPROVAL_CODE,
        title: title.slice(0, 255),
        status: remote.status,
        remoteStatus: remote.remoteStatus,
        serialNumber: remote.serialNumber || null,
        starterOpenId: remote.starterOpenId || null,
        starterUserId: remote.starterUserId || null,
        allocationSourceIds: ownerIds.join(",").slice(0, 500),
        formJson: remote.formJson || null,
        finishedAt: remote.finishedAt,
        paymentConfirmedAt: remote.paymentConfirmedAt,
        paymentConfirmedNode: remote.paymentConfirmedNode,
      },
    );
  } else {
    await execute(
      `INSERT INTO merge_common_feishu_approvals
         (id, ownerType, ownerId, ownerNo, period, approvalCode, instanceCode, serialNumber, title,
          status, remoteStatus, starterOpenId, starterUserId, allocationSourceIds, formJson,
          submittedAt, finishedAt, paymentConfirmedAt, paymentConfirmedNode, lastSyncedAt)
       VALUES
         (:id, :ownerType, :ownerId, :ownerNo, :period, :approvalCode, :instanceCode, :serialNumber, :title,
          :status, :remoteStatus, :starterOpenId, :starterUserId, :allocationSourceIds, :formJson,
          :submittedAt, :finishedAt, :paymentConfirmedAt, :paymentConfirmedNode, CURRENT_TIMESTAMP)`,
      {
        id: savedId,
        ownerType,
        ownerId: ownerIds[0],
        ownerNo: ownerNo || null,
        period,
        approvalCode: COST_PAYMENT_APPROVAL_CODE,
        instanceCode,
        serialNumber: remote.serialNumber || null,
        title: title.slice(0, 255),
        status: remote.status,
        remoteStatus: remote.remoteStatus,
        starterOpenId: remote.starterOpenId || null,
        starterUserId: remote.starterUserId || null,
        allocationSourceIds: ownerIds.join(",").slice(0, 500),
        formJson: remote.formJson || null,
        submittedAt: remote.startedAt ?? new Date(),
        finishedAt: remote.finishedAt,
        paymentConfirmedAt: remote.paymentConfirmedAt,
        paymentConfirmedNode: remote.paymentConfirmedNode,
      },
    );
  }

  for (const ownerId of ownerIds) {
    if (ownerType === "purchase_order_payment") {
      await execute(
        "UPDATE merge_power_purchaseorders SET paymentApprovalId = :approvalId WHERE purchaseOrderId = :ownerId",
        { approvalId: savedId, ownerId },
      );
    } else if (ownerType === "cloud_supplier_payment") {
      await updateCloudSupplierPayment(ownerId, { approvalId: savedId });
    } else {
      await execute(
        "UPDATE merge_po_settlement_invoices SET paymentApprovalId = :approvalId WHERE id = :ownerId",
        { approvalId: savedId, ownerId },
      );
    }
  }
  await applyCostPaymentStatus(ownerType, ownerIds, remote.status, savedId, remote.paymentConfirmedAt);
  return {
    approvalId: savedId,
    instanceCode,
    status: remote.status,
    serialNumber: remote.serialNumber,
    paymentConfirmedAt: remote.paymentConfirmedAt?.toISOString() ?? "",
    paymentConfirmedNode: remote.paymentConfirmedNode,
    ownerIds,
  };
}

/** 列表页用：按来源单据批量取「还在生效的付款审批」（审批中 / 已通过）。 */
export async function loadCostPaymentApprovalMap(ownerType: CostPaymentOwnerType, ownerIds: string[]) {
  const ids = ownerIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  const map = new Map<string, CostPaymentApprovalView>();
  if (!ids.length) return map;
  const rows = await queryRows<Row>(
    `SELECT id, instanceCode, status, rejectReason, serialNumber, ownerId, allocationSourceIds,
            DATE_FORMAT(submittedAt, '%Y-%m-%d %H:%i') AS submittedAt,
            DATE_FORMAT(paymentConfirmedAt, '%Y-%m-%d %H:%i') AS paymentConfirmedAt,
            paymentConfirmedNode
       FROM merge_common_feishu_approvals
      WHERE ownerType = :ownerType
        AND status IN ('pending', 'returned', 'approved')
        AND (ownerId IN (:ids) OR allocationSourceIds IS NOT NULL)
      ORDER BY submittedAt DESC`,
    { ownerType, ids },
  );
  for (const row of rows) {
    const candidates = [String(row.ownerId ?? ""), ...String(row.allocationSourceIds ?? "").split(",")].map((value) => value.trim()).filter(Boolean);
    for (const candidate of candidates) {
      if (!ids.includes(candidate) || map.has(candidate)) continue;
      map.set(candidate, {
        approvalId: String(row.id ?? ""),
        instanceCode: String(row.instanceCode ?? ""),
        status: String(row.status ?? ""),
        rejectReason: String(row.rejectReason ?? ""),
        serialNumber: String(row.serialNumber ?? ""),
        submittedAt: String(row.submittedAt ?? ""),
        paymentConfirmedAt: String(row.paymentConfirmedAt ?? ""),
        paymentConfirmedNode: String(row.paymentConfirmedNode ?? ""),
        ownerIds: candidates,
      });
    }
  }
  return map;
}
