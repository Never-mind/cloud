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
  undertakingUnitCode: string;
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
  /** 算力分支必填 */
  orderNo?: string;
  batchNo?: string;
  /** 弹层里新上传的附件（base64 dataUrl） */
  attachments?: Array<{ fileName: string; dataUrl: string }>;
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
      { id: columns.fee, type: "radioV2", value: FEE_WIDGET_KEY[branch][entry.feeKey] },
      { id: columns.paymentDate, type: "date", value: entry.paymentDate },
      { id: columns.invoice, type: "radioV2", value: entry.invoiceIssued ? INVOICE_WIDGET_KEY[branch].issued : INVOICE_WIDGET_KEY[branch].notIssued },
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
  const companyKeys = new Set(entries.map((entry) => resolveCostPaymentCompanyKey(entry.undertakingUnitCode)));
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
    if (branch === "huawei" && !resolveCostPaymentCustomerKey(entry.customerName)) return `${label} 客户名称没有对应的审批选项`;
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

  const companyKey = resolveCostPaymentCompanyKey(input.entries[0].undertakingUnitCode);
  const formEntries = [];
  const savedAttachments: Array<{ ownerId: string; fileName: string; dataUrl: string; fileType: string }> = [];
  for (const entry of input.entries) {
    const existing = entry.ownerType === "settlement_invoice_payment" ? await loadSettlementInvoiceAttachmentTokens(entry.ownerId) : [];
    const uploaded = await uploadInlineAttachments(entry.attachments ?? []);
    const tokens = [...existing, ...uploaded];
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
      paymentDate: String(entry.paymentDate).slice(0, 10),
      invoiceIssued: Boolean(entry.invoiceIssued),
      customerKey: input.branch === "huawei" ? resolveCostPaymentCustomerKey(entry.customerName) : undefined,
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
async function updateCloudSupplierPayment(ownerId: string, patch: { approvalId: string; paid?: number }) {
  const parsed = parseCloudSupplierPaymentOwnerId(ownerId);
  if (!parsed) {
    await execute(
      `UPDATE merge_cloud_supplier_payments
          SET paymentApprovalId = :approvalId${patch.paid ? ", paid = 1" : ""}
        WHERE id = :ownerId`,
      { approvalId: patch.approvalId, ownerId },
    );
    return;
  }
  await execute(
    `UPDATE merge_cloud_supplier_payments
        SET paymentApprovalId = :approvalId${patch.paid ? ", paid = 1" : ""}
      WHERE period = :period AND supplierId = :supplierId`,
    { approvalId: patch.approvalId, ...parsed },
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

/** 同步审批状态；通过后回写已付款。 */
export async function syncCostPaymentApprovals(limit = 30) {
  const rows = await queryRows<{ id: string; instanceCode: string; ownerType: CostPaymentOwnerType; allocationSourceIds: string | null }>(
    `SELECT id, instanceCode, ownerType, allocationSourceIds
       FROM merge_common_feishu_approvals
      WHERE approvalCode = :approvalCode AND status = 'pending'
      ORDER BY submittedAt ASC LIMIT ${Math.max(1, Math.floor(limit))}`,
    { approvalCode: COST_PAYMENT_APPROVAL_CODE },
  );
  const results: Array<{ instanceCode: string; status: string; changed: boolean }> = [];
  for (const row of rows) {
    const remote = await fetchInvoiceApprovalInstance(row.instanceCode);
    const changed = remote.status !== "pending";
    await execute(
      `UPDATE merge_common_feishu_approvals
          SET status = :status, remoteStatus = :remoteStatus, serialNumber = :serialNumber,
              rejectReason = :rejectReason, finishedAt = :finishedAt, lastSyncedAt = CURRENT_TIMESTAMP, syncError = ''
        WHERE instanceCode = :instanceCode`,
      {
        status: remote.status,
        remoteStatus: remote.remoteStatus,
        serialNumber: remote.serialNumber,
        rejectReason: remote.rejectReason,
        finishedAt: remote.finishedAt,
        instanceCode: row.instanceCode,
      },
    );
    if (changed) {
      const ownerIds = String(row.allocationSourceIds ?? "").split(",").map((value) => value.trim()).filter(Boolean);
      await applyCostPaymentStatus(row.ownerType, ownerIds.length ? ownerIds : [], remote.status, row.id);
    }
    results.push({ instanceCode: row.instanceCode, status: remote.status, changed });
  }
  return { total: rows.length, results };
}

async function applyCostPaymentStatus(ownerType: CostPaymentOwnerType, ownerIds: string[], status: string, approvalId: string) {
  const paid = status === "approved";
  for (const ownerId of ownerIds) {
    if (ownerType === "purchase_order_payment") {
      await execute(
        `UPDATE merge_power_purchaseorders
            SET paymentStatus = :paymentStatus, paidAt = ${paid ? "CURRENT_TIMESTAMP" : "paidAt"}
          WHERE purchaseOrderId = :ownerId`,
        { paymentStatus: paid ? "已付款" : status === "rejected" ? "已驳回" : "未付款", ownerId },
      );
    } else if (ownerType === "cloud_supplier_payment") {
      await updateCloudSupplierPayment(ownerId, { approvalId, ...(paid ? { paid: 1 } : {}) });
    } else {
      await execute(
        `UPDATE merge_po_settlement_invoices SET isPaid = ${paid ? 1 : "isPaid"}, paymentApprovalId = :approvalId WHERE id = :ownerId`,
        { approvalId, ownerId },
      );
    }
  }
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

export type CostPaymentPreviewRow = {
  ownerId: string;
  ownerNo: string;
  period: string;
  supplierId: string;
  supplierName: string;
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
  orderNo: string;
  batchNo: string;
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
                COALESCE(p.paymentTotalAmount, 0) AS amount, COALESCE(p.currency, p.supplierPayableCurrency, 'USD') AS currency,
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
          WHERE CONCAT(p.period, '::', p.supplierId) IN (:ids) OR p.id IN (:ids)`,
        { ids },
      )
    : branch === "other"
      ? await queryRows<Row>(
          `SELECT i.id AS ownerId, i.invoiceNo AS ownerNo, i.accountPeriod AS period, i.invoiceEntityId AS supplierId,
                  i.invoiceEntity AS supplierName, COALESCE(i.invoiceTotal, 0) AS amount, COALESCE(NULLIF(i.currency, ''), 'CNY') AS currency,
                  COALESCE(i.receivableDate, i.accountingDate, i.invoiceDate) AS paymentDate, i.isPaid AS paid, i.isInvoiced,
                  u.undertakingUnitCode, COALESCE(NULLIF(u.shortName, ''), u.entityName, i.companyEntity) AS undertakingUnitName,
                  NULL AS customerName
             FROM merge_po_settlement_invoices i
             LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = i.companyEntityId
            WHERE i.id IN (:ids) AND i.type = 'cost'`,
          { ids },
        )
      : await queryRows<Row>(
          `SELECT po.purchaseOrderId AS ownerId, po.poNo AS ownerNo, DATE_FORMAT(MIN(ri.requestedAt), '%Y-%m-%d') AS period,
                  MIN(ri.supplierId) AS supplierId, MIN(s.shortName) AS supplierName,
                  ROUND(SUM(ri.quantity * poi.unitPrice), 2) AS amount, COALESCE(MIN(po.currency), 'USD') AS currency,
                  po.paymentDate AS paymentDate, po.paymentStatus AS paid,
                  MIN(u.undertakingUnitCode) AS undertakingUnitCode, MIN(COALESCE(NULLIF(u.shortName, ''), u.entityName)) AS undertakingUnitName,
                  GROUP_CONCAT(DISTINCT COALESCE(NULLIF(ri.batchName, ''), NULLIF(req.batchName, '')) ORDER BY ri.batchName SEPARATOR '、') AS batchNo
             FROM merge_power_purchaseorders po
             LEFT JOIN merge_power_purchaseorderitems poi ON poi.purchaseOrderId = po.purchaseOrderId
             LEFT JOIN merge_power_requestitems ri ON ri.id = poi.requestItemId
             LEFT JOIN merge_power_requests req ON req.requestNo = ri.requestNo
             LEFT JOIN merge_common_suppliers s ON s.supplierId = ri.supplierId
             LEFT JOIN merge_common_undertaking_units u ON u.undertakingUnitId = ri.undertakingUnitId
            WHERE po.purchaseOrderId IN (:ids)
            GROUP BY po.purchaseOrderId`,
          { ids },
        );

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

  const rows: CostPaymentPreviewRow[] = sourceRows.map((row) => {
    const supplierId = String(row.supplierId ?? "");
    const bankAccounts = accountsBySupplier.get(supplierId) ?? [];
    const preferred = bankAccounts.find((account) => account.isDefault) ?? bankAccounts[0];
    const paid = branch === "compute" ? String(row.paid ?? "") === "已付款" : Number(row.paid ?? 0) === 1;
    return {
      ownerId: String(row.ownerId ?? ""),
      ownerNo: String(row.ownerNo ?? ""),
      period: String(row.period ?? ""),
      supplierId,
      supplierName: String(row.supplierName ?? ""),
      undertakingUnitCode: String(row.undertakingUnitCode ?? ""),
      undertakingUnitName: String(row.undertakingUnitName ?? ""),
      amount: Number(row.amount ?? 0),
      currency: String(row.currency ?? "").toUpperCase(),
      payee: preferred?.accountName ?? "",
      bankName: preferred?.bankName ?? "",
      bankAccount: preferred?.bankAccount ?? "",
      swiftCode: preferred?.swiftCode ?? "",
      paymentDate: String(branch === "other" && row.isInvoiced === 0 ? "" : row.paymentDate ?? "").slice(0, 10),
      invoiceIssued: branch === "other" ? Number(row.isInvoiced ?? 0) === 1 : Boolean(row.invoiceNo),
      customerName: String(row.customerName ?? ""),
      orderNo: String(row.ownerNo ?? ""),
      batchNo: String(row.batchNo ?? ""),
      paid,
      bankAccounts,
    };
  });
  return {
    branch,
    rows,
    warnings: rows.flatMap((row) => {
      const list: string[] = [];
      if (!row.bankAccounts.length) list.push(`${row.ownerNo || row.ownerId}：供应商还没有银行账户，请先在供应商档案里补`);
      if (row.paid) list.push(`${row.ownerNo || row.ownerId}：已标记为已付款`);
      if (branch === "huawei" && !resolveCostPaymentCustomerKey(row.customerName)) list.push(`${row.ownerNo || row.ownerId}：客户「${row.customerName || "未匹配"}」在审批里没有对应选项`);
      return list;
    }),
  };
}

export type CostPaymentApprovalView = {
  approvalId: string;
  instanceCode: string;
  status: string;
  rejectReason: string;
  serialNumber: string;
  submittedAt: string;
  ownerIds: string[];
};

/** 列表页用：按来源单据批量取「还在生效的付款审批」（审批中 / 已通过）。 */
export async function loadCostPaymentApprovalMap(ownerType: CostPaymentOwnerType, ownerIds: string[]) {
  const ids = ownerIds.map((value) => String(value ?? "").trim()).filter(Boolean);
  const map = new Map<string, CostPaymentApprovalView>();
  if (!ids.length) return map;
  const rows = await queryRows<Row>(
    `SELECT id, instanceCode, status, rejectReason, serialNumber, ownerId, allocationSourceIds,
            DATE_FORMAT(submittedAt, '%Y-%m-%d %H:%i') AS submittedAt
       FROM merge_common_feishu_approvals
      WHERE ownerType = :ownerType
        AND status IN ('pending', 'approved')
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
        ownerIds: candidates,
      });
    }
  }
  return map;
}
