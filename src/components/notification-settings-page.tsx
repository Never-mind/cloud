"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Play, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button, Input, Panel } from "./ui";
import { Modal } from "./modal";
import { confirmDialog, notify } from "./app-dialog";
import { PaginationBar } from "./pagination-bar";

type Row = Record<string, unknown>;

type Rule = {
  id: string;
  name: string;
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
  sentCount: number;
  lastSentAt: string | null;
};

type Candidate = { userId: string; displayName: string; email: string; feishuBound: boolean };
type Record_ = { id: string; ruleName: string; businessNo: string; title: string; recipientName: string; feishuStatus: string; feishuError: string | null; createdAt: string | null };
type Message = { id: string; title: string; content: string; businessNo: string; feishuStatus: string; readAt: string | null; createdAt: string | null };

const TRIGGER_LABELS: Record<string, string> = {
  purchasing: "采购中（建单时间）",
  procurement_completed: "采购完成",
  accepting: "验收开始",
  acceptance_completed: "验收完成",
  closed: "已完结",
};

const DEFAULT_TEMPLATE = "【待开票提醒】项目 {项目号}（客户：{客户}）已于 {进入状态时间} 验收完成，至今 {已过天数} 天。请尽快安排开票并跟进收款。\n承接单位：{承接单位}";

const emptyDraft = {
  id: "",
  name: "验收完成提醒开票",
  triggerStatus: "acceptance_completed",
  delayDays: "3",
  repeatEveryDays: "0",
  channels: ["feishu", "inapp"] as string[],
  titleTemplate: "【待开票提醒】{项目号}",
  bodyTemplate: DEFAULT_TEMPLATE,
  enabled: true,
  recipientIds: [] as string[],
};

export function NotificationSettingsPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [records, setRecords] = useState<Record_[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [canConfigure, setCanConfigure] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<typeof emptyDraft | null>(null);
  const [recordPage, setRecordPage] = useState(1);
  const recordPageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ruleResponse, recordResponse, messageResponse] = await Promise.all([
        fetch("/api/notifications/rules", { cache: "no-store" }),
        fetch("/api/notifications/records?limit=200", { cache: "no-store" }),
        fetch("/api/notifications?limit=20", { cache: "no-store" }),
      ]);
      const ruleData = await ruleResponse.json();
      if (!ruleResponse.ok) throw new Error(String(ruleData.error ?? "加载规则失败"));
      setRules((ruleData.rules ?? []) as Rule[]);
      setCandidates((ruleData.candidates ?? []) as Candidate[]);
      setCanConfigure(Boolean(ruleData.canConfigure));
      const recordData = await recordResponse.json().catch(() => ({}));
      setRecords((recordData.records ?? []) as Record_[]);
      const messageData = await messageResponse.json().catch(() => ({}));
      setMessages((messageData.items ?? []) as Message[]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordPageRows = useMemo(
    () => records.slice((recordPage - 1) * recordPageSize, recordPage * recordPageSize),
    [records, recordPage],
  );

  function startCreate() {
    setDraft({ ...emptyDraft, recipientIds: [] });
  }

  function startEdit(rule: Rule) {
    setDraft({
      id: rule.id,
      name: rule.name,
      triggerStatus: rule.triggerStatus,
      delayDays: String(rule.delayDays),
      repeatEveryDays: String(rule.repeatEveryDays),
      channels: rule.channels.split(",").filter(Boolean),
      titleTemplate: rule.titleTemplate,
      bodyTemplate: rule.bodyTemplate,
      enabled: rule.enabled,
      recipientIds: rule.recipientIds,
    });
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, channels: draft.channels.join(","), delayDays: Number(draft.delayDays || 0), repeatEveryDays: Number(draft.repeatEveryDays || 0) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "保存失败"));
      setDraft(null);
      notify("规则已保存", "success");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(rule: Rule) {
    if (!await confirmDialog(`确认删除规则「${rule.name}」？已发送的历史记录会保留。`)) return;
    const response = await fetch(`/api/notifications/rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { notify(String(data.error ?? "删除失败"), "error"); return; }
    notify("规则已删除", "success");
    await load();
  }

  async function runScan(dryRun: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/notifications/run${dryRun ? "?dryRun=1" : ""}`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "执行失败"));
      setNotice(
        `${dryRun ? "试运行" : "已执行"}：启用规则 ${data.rules} 条，到点单据 ${data.due} 条，` +
        `生成通知 ${data.created} 条，飞书成功 ${data.sent} 条，失败 ${data.failed} 条，去重跳过 ${data.skipped} 条`,
      );
      if (!dryRun) await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "执行失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function testSend() {
    if (!draft) return;
    setBusy(true);
    try {
      const response = await fetch("/api/notifications/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data.error ?? "试发失败"));
      notify("已发送到你的飞书，请查收", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "试发失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-medium text-ink">消息通知</h1>
          <p className="mt-1 text-sm text-ink-3">按业务状态与天数自动提醒（飞书 + 站内消息）。同一条规则对同一单据同一人只提醒一次。</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canConfigure ? <Button disabled={busy} onClick={() => void runScan(true)}><Play size={15} />试运行</Button> : null}
          {canConfigure ? <Button disabled={busy} onClick={() => void runScan(false)}><RefreshCw size={15} />立即检查并发送</Button> : null}
          {canConfigure ? <Button tone="primary" onClick={startCreate}><Plus size={15} />新建规则</Button> : null}
        </div>
      </div>

      {notice ? <div className="flex items-center justify-between border border-info-border bg-info-soft px-3 py-2 text-sm text-primary">{notice}<button onClick={() => setNotice("")} type="button">关闭</button></div> : null}

      <Panel>
        <div className="border-b border-line-soft p-4 font-medium text-ink">通知规则</div>
        <div className="table-scroll overflow-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                {["规则名称", "触发条件", "重复提醒", "渠道", "通知对象", "已发送", "状态", "操作"].map((label) => (
                  <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr className="hover:bg-surface-2" key={rule.id}>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{rule.name}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">
                    项目结算 · {TRIGGER_LABELS[rule.triggerStatus] ?? rule.triggerStatus} 后 {rule.delayDays} 天
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">
                    {rule.repeatEveryDays > 0 ? `逾期每 ${rule.repeatEveryDays} 天再提醒` : "仅提醒一次"}
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">
                    {rule.channels.includes("feishu") ? "飞书" : ""}{rule.channels.includes("feishu") && rule.channels.includes("inapp") ? " + " : ""}{rule.channels.includes("inapp") ? "站内" : ""}
                  </td>
                  <td className="border-b border-r border-line-soft px-3 py-3">
                    {rule.recipientNames.length ? rule.recipientNames.join("、") : <span className="text-danger">未选择收件人</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{rule.sentCount}{rule.lastSentAt ? <span className="ml-2 text-xs text-ink-3">最近 {rule.lastSentAt}</span> : null}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">
                    <span className={rule.enabled ? "rounded bg-success-soft px-2 py-1 text-xs text-success-strong" : "rounded bg-canvas-deep px-2 py-1 text-xs text-ink-3"}>{rule.enabled ? "启用" : "停用"}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-line-soft px-3 py-3">
                    {canConfigure ? (
                      <div className="flex gap-2">
                        <Button onClick={() => startEdit(rule)}>编辑</Button>
                        <Button tone="danger" onClick={() => void removeRule(rule)}><Trash2 size={14} />删除</Button>
                      </div>
                    ) : <span className="text-xs text-ink-3">仅管理员可配置</span>}
                  </td>
                </tr>
              ))}
              {!rules.length && !loading ? (
                <tr><td className="py-12 text-center text-ink-3" colSpan={8}>还没有规则，点右上角「新建规则」开始配置</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2 border-b border-line-soft p-4">
          <span className="font-medium text-ink">我的消息</span>
          <span className="text-xs text-ink-3">只有发给你的提醒会出现在这里</span>
          <Button className="ml-auto" onClick={() => void markAllRead()}><BellRing size={15} />全部标为已读</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {messages.map((message) => (
            <div className={`p-4 ${message.readAt ? "" : "bg-info-soft"}`} key={message.id}>
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                {message.readAt ? null : <span className="h-2 w-2 rounded-full bg-primary" />}
                {message.title}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{message.content}</div>
              <div className="mt-2 text-xs text-ink-3">{message.createdAt} · {message.feishuStatus === "sent" ? "已发飞书" : message.feishuStatus === "failed" ? "飞书发送失败" : "仅站内"}</div>
            </div>
          ))}
          {!messages.length ? <div className="p-8 text-center text-sm text-ink-3">暂无消息</div> : null}
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-line-soft p-4 font-medium text-ink">发送记录（最近 200 条）</div>
        <div className="table-scroll overflow-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-canvas text-ink">
              <tr>
                {["时间", "规则", "单据", "标题", "收件人", "飞书结果"].map((label) => (
                  <th className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3 text-left font-medium" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recordPageRows.map((record) => (
                <tr className="hover:bg-surface-2" key={record.id}>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{record.createdAt ?? "-"}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{record.ruleName || "-"}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{record.businessNo || "-"}</td>
                  <td className="border-b border-r border-line-soft px-3 py-3">{record.title}</td>
                  <td className="whitespace-nowrap border-b border-r border-line-soft px-3 py-3">{record.recipientName || "-"}</td>
                  <td className="border-b border-line-soft px-3 py-3">
                    {record.feishuStatus === "sent" ? <span className="text-success-strong">已发送</span>
                      : record.feishuStatus === "failed" ? <span className="text-danger">失败：{record.feishuError ?? ""}</span>
                      : <span className="text-ink-3">仅站内</span>}
                  </td>
                </tr>
              ))}
              {!recordPageRows.length ? <tr><td className="py-10 text-center text-ink-3" colSpan={6}>暂无发送记录</td></tr> : null}
            </tbody>
          </table>
        </div>
        <PaginationBar page={recordPage} pageSize={recordPageSize} total={records.length} onPageChange={setRecordPage} />
      </Panel>

      {draft ? (
        <Modal
          footer={<><Button disabled={busy} onClick={() => void testSend()}><Send size={15} />试发给我</Button><Button onClick={() => setDraft(null)}>取消</Button><Button disabled={busy} tone="primary" onClick={() => void saveDraft()}>保存</Button></>}
          onClose={() => setDraft(null)}
          title={draft.id ? "编辑通知规则" : "新建通知规则"}
          widthClass="max-w-3xl"
        >
          <div className="grid gap-4">
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">规则名称</span>
              <Input className="w-full" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">触发状态</span>
                <select className="h-9 w-full rounded border border-line bg-white px-2 text-sm" value={draft.triggerStatus} onChange={(event) => setDraft({ ...draft, triggerStatus: event.target.value })}>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">状态后多少天触发</span>
                <Input className="w-full" value={draft.delayDays} onChange={(event) => setDraft({ ...draft, delayDays: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">逾期重复间隔（0=只提醒一次）</span>
                <Input className="w-full" value={draft.repeatEveryDays} onChange={(event) => setDraft({ ...draft, repeatEveryDays: event.target.value })} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-ink-2">
              <span>通知渠道：</span>
              {[["feishu", "飞书私聊"], ["inapp", "站内消息"]].map(([value, label]) => (
                <label className="inline-flex items-center gap-1" key={value}>
                  <input
                    checked={draft.channels.includes(value)}
                    onChange={(event) => setDraft({ ...draft, channels: event.target.checked ? [...draft.channels, value] : draft.channels.filter((item) => item !== value) })}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
              <label className="ml-auto inline-flex items-center gap-1">
                <input checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} type="checkbox" />启用
              </label>
            </div>
            <div>
              <span className="mb-2 block text-sm text-ink-2">收件人（可多选，未绑定飞书的只能收到站内消息）</span>
              <div className="flex flex-wrap gap-2">
                {candidates.map((candidate) => {
                  const checked = draft.recipientIds.includes(candidate.userId);
                  return (
                    <label className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${checked ? "border-primary bg-info-soft text-primary" : "border-line-soft text-ink-2"}`} key={candidate.userId}>
                      <input
                        checked={checked}
                        onChange={(event) => setDraft({ ...draft, recipientIds: event.target.checked ? [...draft.recipientIds, candidate.userId] : draft.recipientIds.filter((id) => id !== candidate.userId) })}
                        type="checkbox"
                      />
                      {candidate.displayName}
                      {candidate.feishuBound ? null : <span className="text-ink-3">（未绑定飞书）</span>}
                    </label>
                  );
                })}
              </div>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">标题模板</span>
              <Input className="w-full" value={draft.titleTemplate} onChange={(event) => setDraft({ ...draft, titleTemplate: event.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-ink-2">消息模板</span>
              <textarea
                className="min-h-28 w-full rounded border border-line px-3 py-2 text-sm outline-none focus:border-primary"
                onChange={(event) => setDraft({ ...draft, bodyTemplate: event.target.value })}
                value={draft.bodyTemplate}
              />
              <span className="mt-1 block text-xs text-ink-3">可用变量：{"{项目号}"} {"{项目名称}"} {"{客户}"} {"{承接单位}"} {"{进入状态时间}"} {"{已过天数}"}</span>
            </label>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
