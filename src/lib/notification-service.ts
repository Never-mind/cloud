/**
 * 消息通知：规则配置 + 按业务状态时间节点扫描 + 飞书/站内双通道发送。
 *
 * 第一期只覆盖「集采系统 / 项目结算」：例如"验收完成后 3 天提醒开票"。
 * 触发的判定是"该状态节点已经发生过，且距节点时间已过 N 天"，不要求单据当前还停在该状态
 * —— 因为验收完成后项目往往会继续走到已完结，但开票/收款这两个动作仍然待办。
 * 同一条规则对同一单据同一收件人只会发一次（数据库唯一键去重）。
 */
import { randomUUID } from "node:crypto";
import { execute, queryRows, type Row } from "./db";
import { sendFeishuTextToUser } from "./feishu-message-service";
import type { OperationActor } from "./operation-actor";

const RULE_TABLE = "merge_common_notification_rules";
const RECIPIENT_TABLE = "merge_common_notification_rule_recipients";
const NOTIFICATION_TABLE = "merge_common_notifications";

const SETTLEMENT_BUSINESS_TYPE = "settlement-projects";

/** 项目结算可作为触发点的状态，以及每个状态对应的"进入时间"字段。 */
export const SETTLEMENT_NOTIFICATION_TRIGGERS = [
  { status: "purchasing", label: "采购中", field: "createdAt" },
  { status: "procurement_completed", label: "采购完成", field: "procurementCompletedAt" },
  { status: "accepting", label: "验收开始", field: "acceptanceStartedAt" },
  { status: "acceptance_completed", label: "验收完成", field: "acceptanceCompletedAt" },
  { status: "closed", label: "已完结", field: "closedAt" },
] as const;

const SETTLEMENT_STATUS_ORDER: readonly string[] = SETTLEMENT_NOTIFICATION_TRIGGERS.map((trigger) => String(trigger.status));

export type NotificationRule = {
  id: string;
  name: string;
  domainKey: string;
  moduleKey: string;
  triggerStatus: string;
  delayDays: number;
  repeatEveryDays: number;
  channels: string;
  titleTemplate: string;
  bodyTemplate: string;
  enabled: boolean;
  recipientIds: string[];
  recipientNames: string[];
  updatedAt: string | null;
  lastSentAt: string | null;
  sentCount: number;
};

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 渲染消息模板。
 * 变量写成 {项目号} 这种中文占位符，纯函数便于测试；未知变量原样保留，方便配置人自己发现拼错。
 */
export function renderNotificationTemplate(template: string, variables: Record<string, string>) {
  return String(template ?? "").replace(/\{([^{}]+)\}/g, (whole, key: string) => {
    const value = variables[key.trim()];
    return value === undefined ? whole : value;
  });
}

/** 相隔天数（按自然日算，避免"今天 23:59 → 明天 00:01"被算成 0 天）。 */
export function daysBetween(from: Date, to: Date) {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.floor((end - start) / 86_400_000);
}

export async function listNotificationRules(): Promise<NotificationRule[]> {
  const rows = await queryRows<Row>(
    `SELECT r.*,
            (SELECT GROUP_CONCAT(recipient.userId ORDER BY recipient.userId) FROM ${RECIPIENT_TABLE} recipient WHERE recipient.ruleId = r.id) AS recipientIds,
            (SELECT GROUP_CONCAT(COALESCE(NULLIF(u.displayName, ''), u.email) ORDER BY recipient.userId)
               FROM ${RECIPIENT_TABLE} recipient LEFT JOIN merge_common_users u ON u.userId = recipient.userId
              WHERE recipient.ruleId = r.id) AS recipientNames,
            (SELECT COUNT(*) FROM ${NOTIFICATION_TABLE} n WHERE n.ruleId = r.id) AS sentCount,
            (SELECT MAX(n.createdAt) FROM ${NOTIFICATION_TABLE} n WHERE n.ruleId = r.id) AS lastSentAt
       FROM ${RULE_TABLE} r
      ORDER BY r.enabled DESC, r.createdAt ASC`,
  );
  return rows.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    domainKey: text(row.domainKey) || "po",
    moduleKey: text(row.moduleKey) || SETTLEMENT_BUSINESS_TYPE,
    triggerStatus: text(row.triggerStatus),
    delayDays: number(row.delayDays),
    repeatEveryDays: number(row.repeatEveryDays),
    channels: text(row.channels) || "feishu,inapp",
    titleTemplate: text(row.titleTemplate),
    bodyTemplate: text(row.bodyTemplate),
    enabled: Number(row.enabled ?? 0) === 1,
    recipientIds: text(row.recipientIds) ? text(row.recipientIds).split(",").filter(Boolean) : [],
    recipientNames: text(row.recipientNames) ? text(row.recipientNames).split(",").filter(Boolean) : [],
    updatedAt: row.updatedAt ? String(row.updatedAt) : null,
    lastSentAt: row.lastSentAt ? String(row.lastSentAt) : null,
    sentCount: number(row.sentCount),
  }));
}

export type NotificationRuleInput = {
  id?: string;
  name?: string;
  moduleKey?: string;
  triggerStatus?: string;
  delayDays?: number | string;
  repeatEveryDays?: number | string;
  channels?: string[] | string;
  titleTemplate?: string;
  bodyTemplate?: string;
  enabled?: boolean;
  recipientIds?: string[];
};

export async function saveNotificationRule(input: NotificationRuleInput, actor: OperationActor | null) {
  const name = text(input.name);
  if (!name) throw new Error("请填写规则名称");
  const trigger = SETTLEMENT_NOTIFICATION_TRIGGERS.find((item) => item.status === text(input.triggerStatus));
  if (!trigger) throw new Error("请选择触发状态");
  const delayDays = Math.max(0, Math.trunc(number(input.delayDays)));
  const repeatEveryDays = Math.max(0, Math.trunc(number(input.repeatEveryDays)));
  const channels = Array.isArray(input.channels)
    ? input.channels.map(text).filter(Boolean)
    : text(input.channels).split(",").map((item) => item.trim()).filter(Boolean);
  if (!channels.length) throw new Error("请至少选择一个通知渠道");
  const titleTemplate = text(input.titleTemplate) || name;
  const bodyTemplate = text(input.bodyTemplate);
  if (!bodyTemplate) throw new Error("请填写消息模板");
  const recipientIds = Array.from(new Set((input.recipientIds ?? []).map(text).filter(Boolean)));

  const id = text(input.id) || randomUUID();
  const existing = await queryRows<Row>(`SELECT id FROM ${RULE_TABLE} WHERE id = :id`, { id });
  if (existing.length) {
    await execute(
      `UPDATE ${RULE_TABLE}
          SET name = :name, moduleKey = :moduleKey, triggerStatus = :triggerStatus, delayDays = :delayDays,
              repeatEveryDays = :repeatEveryDays, channels = :channels, titleTemplate = :titleTemplate,
              bodyTemplate = :bodyTemplate, enabled = :enabled,
              updatedByUserId = :userId, updatedByName = :userName
        WHERE id = :id`,
      {
        id, name, moduleKey: SETTLEMENT_BUSINESS_TYPE, triggerStatus: trigger.status, delayDays, repeatEveryDays,
        channels: channels.join(","), titleTemplate, bodyTemplate, enabled: input.enabled === false ? 0 : 1,
        userId: actor?.userId ?? null, userName: actor?.displayName ?? null,
      },
    );
    await execute(`DELETE FROM ${RECIPIENT_TABLE} WHERE ruleId = :id`, { id });
  } else {
    await execute(
      `INSERT INTO ${RULE_TABLE}
        (id, name, domainKey, moduleKey, triggerStatus, delayDays, repeatEveryDays, channels, titleTemplate, bodyTemplate, enabled, createdByUserId, createdByName, updatedByUserId, updatedByName)
       VALUES (:id, :name, 'po', :moduleKey, :triggerStatus, :delayDays, :repeatEveryDays, :channels, :titleTemplate, :bodyTemplate, :enabled, :userId, :userName, :userId, :userName)`,
      {
        id, name, moduleKey: SETTLEMENT_BUSINESS_TYPE, triggerStatus: trigger.status, delayDays, repeatEveryDays,
        channels: channels.join(","), titleTemplate, bodyTemplate, enabled: input.enabled === false ? 0 : 1,
        userId: actor?.userId ?? null, userName: actor?.displayName ?? null,
      },
    );
  }

  for (const userId of recipientIds) {
    if (!userId) continue;
    await execute(
      `INSERT IGNORE INTO ${RECIPIENT_TABLE} (ruleId, userId) VALUES (:ruleId, :userId)`,
      { ruleId: id, userId },
    );
  }
  return { id };
}

export async function deleteNotificationRule(id: string) {
  const ruleId = text(id);
  if (!ruleId) throw new Error("请指定规则");
  await execute(`DELETE FROM ${RECIPIENT_TABLE} WHERE ruleId = :ruleId`, { ruleId });
  await execute(`DELETE FROM ${RULE_TABLE} WHERE id = :ruleId`, { ruleId });
  return { ok: true };
}

/** 可选的收件人：启用中的系统用户，标注是否已绑定飞书。 */
export async function listNotificationCandidates() {
  const rows = await queryRows<Row>(
    `SELECT userId, COALESCE(NULLIF(displayName, ''), email) AS displayName, email, role,
            CASE WHEN feishuOpenId IS NULL OR feishuOpenId = '' THEN 0 ELSE 1 END AS feishuBound
       FROM merge_common_users WHERE status = 'active' ORDER BY displayName, email`,
  );
  return rows.map((row) => ({
    userId: text(row.userId),
    displayName: text(row.displayName) || text(row.email),
    email: text(row.email),
    role: text(row.role),
    feishuBound: Number(row.feishuBound ?? 0) === 1,
  }));
}

export async function listMyNotifications(userId: string, limit = 50) {
  const rows = await queryRows<Row>(
    `SELECT id, title, content, businessType, businessId, businessNo, feishuStatus, feishuError, sentAt, readAt, createdAt
       FROM ${NOTIFICATION_TABLE} WHERE recipientUserId = :userId
      ORDER BY (readAt IS NULL) DESC, createdAt DESC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
    { userId: text(userId) },
  );
  return rows.map((row) => ({
    id: text(row.id),
    title: text(row.title),
    content: text(row.content),
    businessType: text(row.businessType),
    businessId: text(row.businessId),
    businessNo: text(row.businessNo),
    feishuStatus: text(row.feishuStatus),
    feishuError: text(row.feishuError) || null,
    sentAt: row.sentAt ? String(row.sentAt) : null,
    readAt: row.readAt ? String(row.readAt) : null,
    createdAt: row.createdAt ? String(row.createdAt) : null,
  }));
}

/** 发送记录（管理员视角）：谁、什么时候、发给谁、成功还是失败。 */
export async function listNotificationRecords(limit = 50) {
  const rows = await queryRows<Row>(
    `SELECT n.id, n.businessNo, n.title, n.feishuStatus, n.feishuError, n.sentAt, n.createdAt,
            r.name AS ruleName,
            COALESCE(NULLIF(u.displayName, ''), u.email) AS recipientName
       FROM ${NOTIFICATION_TABLE} n
       LEFT JOIN ${RULE_TABLE} r ON r.id = n.ruleId
       LEFT JOIN merge_common_users u ON u.userId = n.recipientUserId
      ORDER BY n.createdAt DESC LIMIT ${Math.max(1, Math.min(200, Math.trunc(limit)))}`,
  );
  return rows.map((row) => ({
    id: text(row.id),
    ruleName: text(row.ruleName),
    businessNo: text(row.businessNo),
    title: text(row.title),
    recipientName: text(row.recipientName),
    feishuStatus: text(row.feishuStatus),
    feishuError: text(row.feishuError) || null,
    sentAt: row.sentAt ? String(row.sentAt) : null,
    createdAt: row.createdAt ? String(row.createdAt) : null,
  }));
}

export async function countUnreadNotifications(userId: string) {
  const rows = await queryRows<Row>(
    `SELECT COUNT(*) AS c FROM ${NOTIFICATION_TABLE} WHERE recipientUserId = :userId AND readAt IS NULL`,
    { userId: text(userId) },
  );
  return number(rows[0]?.c);
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const targetIds = (ids ?? []).map(text).filter(Boolean);
  if (!targetIds.length) {
    await execute(
      `UPDATE ${NOTIFICATION_TABLE} SET readAt = CURRENT_TIMESTAMP WHERE recipientUserId = :userId AND readAt IS NULL`,
      { userId: text(userId) },
    );
    return { ok: true };
  }
  for (const id of targetIds) {
    await execute(
      `UPDATE ${NOTIFICATION_TABLE} SET readAt = CURRENT_TIMESTAMP WHERE id = :id AND recipientUserId = :userId`,
      { id, userId: text(userId) },
    );
  }
  return { ok: true };
}

type SettlementProjectRow = Row & {
  id: string;
  projectNo: string;
  projectName: string | null;
  customerName: string | null;
  contractingUnitName: string | null;
  status: string;
};

/** 找出某条规则当前"到点该提醒"的项目结算单。 */
async function findDueSettlementProjects(rule: NotificationRule, today: Date) {
  const trigger = SETTLEMENT_NOTIFICATION_TRIGGERS.find((item) => item.status === rule.triggerStatus);
  if (!trigger) return [];
  const triggerIndex = SETTLEMENT_STATUS_ORDER.indexOf(trigger.status);
  const rows = await queryRows<SettlementProjectRow>(
    `SELECT id, projectNo, projectName, customerName, contractingUnitName, status,
            \`${trigger.field}\` AS triggerAt
       FROM merge_po_settlement_projects
      WHERE \`${trigger.field}\` IS NOT NULL`,
  );
  const due: Array<{ project: SettlementProjectRow; triggerAt: Date; elapsedDays: number }> = [];
  for (const row of rows) {
    // 该节点还没发生（当前状态在它之前）就不提醒。
    const currentIndex = SETTLEMENT_STATUS_ORDER.indexOf(text(row.status));
    if (currentIndex >= 0 && currentIndex < triggerIndex) continue;
    const triggerAt = new Date(String(row.triggerAt));
    if (Number.isNaN(triggerAt.getTime())) continue;
    const elapsedDays = daysBetween(triggerAt, today);
    if (elapsedDays < rule.delayDays) continue;
    // 逾期重复提醒：间隔为 0 表示只提醒一次（靠唯一键去重）。
    if (rule.repeatEveryDays > 0 && (elapsedDays - rule.delayDays) % rule.repeatEveryDays !== 0) continue;
    due.push({ project: row, triggerAt, elapsedDays });
  }
  return due;
}

function formatDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function buildVariables(project: SettlementProjectRow, triggerAt: Date, elapsedDays: number) {
  return {
    项目号: text(project.projectNo),
    项目名称: text(project.projectName),
    客户: text(project.customerName),
    承接单位: text(project.contractingUnitName),
    进入状态时间: formatDateTime(triggerAt),
    已过天数: String(elapsedDays),
  };
}

export type NotificationScanResult = {
  rules: number;
  due: number;
  created: number;
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{ rule: string; projectNo: string; recipient: string; status: string; error?: string }>;
};

/**
 * 扫描并发送。dryRun=true 时只算不发，用于"立即检查"预览。
 */
export async function runNotificationScan({ today = new Date(), dryRun = false }: { today?: Date; dryRun?: boolean } = {}): Promise<NotificationScanResult> {
  const rules = (await listNotificationRules()).filter((rule) => rule.enabled);
  const result: NotificationScanResult = { rules: rules.length, due: 0, created: 0, sent: 0, failed: 0, skipped: 0, details: [] };

  for (const rule of rules) {
    const dueProjects = await findDueSettlementProjects(rule, today);
    result.due += dueProjects.length;
    if (!dueProjects.length || !rule.recipientIds.length) continue;

    const recipientRows = await queryRows<Row>(
      `SELECT userId, COALESCE(NULLIF(displayName, ''), email) AS displayName, feishuOpenId
         FROM merge_common_users WHERE userId IN (:ids)`,
      { ids: rule.recipientIds },
    );
    const recipientById = new Map(recipientRows.map((row) => [text(row.userId), row]));

    for (const entry of dueProjects) {
      const variables = buildVariables(entry.project, entry.triggerAt, entry.elapsedDays);
      const title = renderNotificationTemplate(rule.titleTemplate, variables);
      const content = renderNotificationTemplate(rule.bodyTemplate, variables);
      for (const recipientUserId of rule.recipientIds) {
        const recipient = recipientById.get(recipientUserId);
        if (!recipient) continue;
        const exists = await queryRows<Row>(
          `SELECT id FROM ${NOTIFICATION_TABLE}
            WHERE ruleId = :ruleId AND businessId = :businessId AND recipientUserId = :recipientUserId`,
          { ruleId: rule.id, businessId: entry.project.id, recipientUserId },
        );
        if (exists.length) { result.skipped += 1; continue; }
        if (dryRun) {
          result.created += 1;
          result.details.push({ rule: rule.name, projectNo: entry.project.projectNo, recipient: text(recipient.displayName), status: "dry-run" });
          continue;
        }

        const id = randomUUID();
        const wantFeishu = rule.channels.split(",").includes("feishu");
        const openId = text(recipient.feishuOpenId);
        const sendResult = wantFeishu ? await sendFeishuTextToUser(openId, `${title}\n\n${content}`) : { ok: false as const, error: "未启用飞书渠道" };
        await execute(
          `INSERT INTO ${NOTIFICATION_TABLE}
            (id, ruleId, businessType, businessId, businessNo, recipientUserId, title, content, feishuStatus, feishuError, sentAt)
           VALUES (:id, :ruleId, :businessType, :businessId, :businessNo, :recipientUserId, :title, :content, :feishuStatus, :feishuError, :sentAt)`,
          {
            id,
            ruleId: rule.id,
            businessType: SETTLEMENT_BUSINESS_TYPE,
            businessId: entry.project.id,
            businessNo: entry.project.projectNo,
            recipientUserId,
            title,
            content,
            feishuStatus: sendResult.ok ? "sent" : wantFeishu ? "failed" : "skipped",
            feishuError: sendResult.ok ? null : sendResult.error,
            sentAt: sendResult.ok ? new Date() : null,
          },
        );
        result.created += 1;
        if (sendResult.ok) result.sent += 1;
        else if (wantFeishu) result.failed += 1;
        else result.skipped += 1;
        result.details.push({
          rule: rule.name,
          projectNo: entry.project.projectNo,
          recipient: text(recipient.displayName),
          status: sendResult.ok ? "sent" : wantFeishu ? "failed" : "inapp-only",
          error: sendResult.ok ? undefined : sendResult.error,
        });
      }
    }
  }
  return result;
}

/**
 * 试发：只发给配置人自己，用于验证飞书权限与模板效果。
 * 不写入通知记录，避免污染正式发送统计。
 */
export async function sendTestNotification(rule: NotificationRuleInput, actor: OperationActor) {
  const variables: Record<string, string> = {
    项目号: "PJ-TEST-0001",
    项目名称: "（试发示例）",
    客户: "示例客户",
    承接单位: "示例承接单位",
    进入状态时间: formatDateTime(new Date()),
    已过天数: String(Math.max(0, Math.trunc(number(rule.delayDays)))),
  };
  const title = renderNotificationTemplate(text(rule.titleTemplate) || "【试发】消息通知", variables);
  const content = renderNotificationTemplate(text(rule.bodyTemplate) || "这是一条试发消息。", variables);
  const rows = await queryRows<Row>(
    "SELECT feishuOpenId FROM merge_common_users WHERE userId = :userId",
    { userId: actor.userId },
  );
  const result = await sendFeishuTextToUser(text(rows[0]?.feishuOpenId), `【试发】${title}\n\n${content}`);
  return result;
}
