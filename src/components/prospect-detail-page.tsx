"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Building2, Download, Edit3, FileUp, ListChecks, Plus, RefreshCw, Save, Trash2, UserRoundCheck, type LucideIcon } from "lucide-react";
import { PROSPECT_STATUSES } from "@/lib/prospect";
import { formatDisplayValue } from "@/lib/display-format";
import { buildDetailRoute, getReturnTo } from "@/lib/client-list-navigation";
import { broadcastMasterDataChanged } from "@/lib/workspace-events";
import { Button, IconButton, IconLink, Input, Panel, Select, Textarea } from "./ui";
import { confirmDialog, notify } from "./app-dialog";
import { ProspectBaseFields, ProspectConversion, prospectJson, prospectLabel, prospectRequest, type ProspectRow, type ProspectCapabilities } from "./prospect-forms";

type Detail = { prospect: ProspectRow; followups: ProspectRow[]; capabilities: ProspectCapabilities };
type Attachment = { attachmentId: string; fileName: string; fileSize: number; uploadedAt?: string | null };
const sections = [{ id: "basic-info", label: "基础资料" }, { id: "followups", label: "跟进记录" }, { id: "attachments", label: "附件" }];

export function ProspectDetailPage({ id }: { id: string }) {
  return <ProspectArchive key={id} id={id} />;
}

function ProspectArchive({ id }: { id: string }) {
  const params = useSearchParams(), router = useRouter();
  const isCreate = id === "new", embedded = params.get("embed") === "1";
  const back = getReturnTo(params.get("returnTo"), `/prospects${embedded ? "?embed=1" : ""}`);
  const current = buildDetailRoute(`/prospects/${id}`, back);
  const base = `/api/prospects/${encodeURIComponent(id)}`;
  const attachmentBase = `/api/common/attachments/prospects/${encodeURIComponent(id)}`;
  const [data, setData] = useState<Detail | null>(null);
  const [draft, setDraft] = useState<ProspectRow>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(isCreate), [converting, setConverting] = useState(false), [followup, setFollowup] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [activeSection, setActiveSection] = useState("basic-info");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const [detail, files] = await Promise.all([
        prospectRequest(base, { signal }),
        isCreate ? Promise.resolve({ attachments: [] }) : prospectRequest(attachmentBase, { signal }),
      ]);
      if (signal?.aborted) return;
      setData(detail); setDraft(detail.prospect); setAttachments(files.attachments);
    } catch (e) { if (!signal?.aborted) setError((e as Error).message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [base, attachmentBase, isCreate]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const dirty = editing && data && Object.keys(draft).some(key => String(draft[key] ?? "") !== String(data.prospect[key] ?? ""));
  useEffect(() => {
    if (!dirty && !busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await prospectRequest(isCreate ? "/api/prospects" : base, prospectJson(isCreate ? "POST" : "PUT", draft));
      broadcastMasterDataChanged("prospects");
      if (isCreate) {
        router.replace(buildDetailRoute(`/prospects/${encodeURIComponent(saved.prospect.id)}`, back));
      } else {
        setData({ ...data, ...saved }); setDraft(saved.prospect); setEditing(false); setNotice("潜在客户档案已保存");
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  function cancelEditing() {
    if (isCreate) { router.push(back); return; }
    setDraft(data!.prospect); setEditing(false); setError("");
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = "";
    if (!files.length || busy || editing) return;
    if (files.some(file => file.size > 200 * 1024 * 1024)) { notify("单个附件不能超过200 MB", "error"); return; }
    setBusy(true);
    try {
      for (const file of files) { const body = new FormData(); body.set("file", file); await prospectRequest(attachmentBase, { method: "POST", body }); }
      setNotice("附件已上传");
    } catch (e) { notify((e as Error).message, "error"); }
    finally {
      try { setAttachments((await prospectRequest(attachmentBase)).attachments); }
      catch (e) { notify((e as Error).message, "error"); }
      setBusy(false);
    }
  }
  async function removeFile(file: Attachment) {
    if (!await confirmDialog(`删除附件“${file.fileName}”吗？`)) return;
    setBusy(true);
    try {
      await prospectRequest(`${attachmentBase}/${file.attachmentId}`, { method: "DELETE" });
      setAttachments((await prospectRequest(attachmentBase)).attachments);
    } catch (e) { notify((e as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!await confirmDialog("删除该潜在客户及其跟进记录？")) return;
    setBusy(true);
    try { await prospectRequest(base, { method: "DELETE" }); broadcastMasterDataChanged("prospects"); router.push(back); }
    catch (e) { notify((e as Error).message, "error"); }
    finally { setBusy(false); }
  }
  async function goBack(event: React.MouseEvent<HTMLAnchorElement>) {
    if (busy || followup || dirty) {
      event.preventDefault();
      if (!busy && await confirmDialog("当前填写的内容尚未保存，确定离开吗？")) router.push(back);
    }
  }

  if (!data) return <Panel className="p-10 text-center text-sm"><p role={error ? "alert" : undefined}>{error || "正在加载潜在客户档案…"}</p>{error ? <Button className="mt-4" onClick={() => void load()}>重试</Button> : null}</Panel>;
  const row = data.prospect, cap = data.capabilities, converted = row.status === "converted";
  const locked = busy || loading || followup;
  const childLocked = locked || editing || isCreate;
  return <Panel>
    <header className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
      <Link className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-white text-ink-2 hover:border-primary hover:text-primary" href={back} onClick={goBack} aria-label="返回潜在客户" title="返回潜在客户"><ArrowLeft size={17} /></Link>
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-medium text-ink">{isCreate ? "新建潜在客户" : row.name}</h1>{!isCreate ? <ProspectStatus status={row.status} /> : null}</div><p className="mt-1 text-xs text-ink-3">{isCreate ? "新建档案" : `潜在客户档案 · 负责人：${row.ownerName || "—"}`}</p></div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!isCreate ? <div className="mr-2 text-xs text-ink-3"><span>创建 {formatDisplayValue(row.createdAt, "datetime")}</span><span className="ml-3">更新 {formatDisplayValue(row.updatedAt, "datetime")}</span></div> : null}
        {editing ? <><Button disabled={locked} onClick={cancelEditing}>取消</Button><Button tone="primary" type="submit" form="prospect-master-form" disabled={locked}><Save size={15} />{busy ? "保存中…" : "保存"}</Button></> : <>
          {!converted && cap.update ? <Button tone="primary" disabled={locked} onClick={() => { setNotice(""); setError(""); setEditing(true); }}><Edit3 size={15} />修改</Button> : null}
          {!converted && row.status !== "closed" && cap.convert && (cap.createCustomer || cap.viewCustomer) ? <Button disabled={locked} onClick={() => setConverting(true)}><UserRoundCheck size={15} />转为客户</Button> : null}
          {!converted && cap.delete ? <IconButton disabled={locked} label="删除潜在客户" icon={<Trash2 size={15} />} tone="danger" onClick={() => void remove()} /> : null}
        </>}
        <IconButton size="default" label="刷新" disabled={locked || editing} icon={<RefreshCw size={15} />} onClick={() => void load()} />
      </div>
    </header>
    {error ? <div role="alert" className="border-b border-danger-border bg-danger-soft px-5 py-3 text-sm text-danger">{error}</div> : null}
    {notice ? <div role="status" className="border-b border-success-border bg-success-soft px-5 py-3 text-sm text-success-strong">{notice}</div> : null}
    {converted ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-success-border bg-success-soft px-5 py-3 text-sm"><span>已于 {row.convertedAt} 转为客户：{row.customerName || row.customerCode}。原始资料及跟进记录已归档。</span>{cap.viewCustomer ? <Link className="font-medium text-primary" href={buildDetailRoute(`/customers/${row.customerId}`, current)}>查看客户档案 →</Link> : null}</div> : null}
    <nav className="flex overflow-x-auto border-b border-line-soft bg-white px-5" aria-label="档案分区">
      {sections.map(section => <a key={section.id} href={`#${section.id}`} onClick={() => setActiveSection(section.id)} aria-current={activeSection === section.id ? "location" : undefined} className={`mr-7 whitespace-nowrap border-b-2 px-1 py-3 text-sm ${activeSection === section.id ? "border-primary text-primary" : "border-transparent text-ink-2 hover:text-primary"}`}>{section.label}</a>)}
    </nav>
    <ArchiveSection id="basic-info" title="基础资料" icon={Building2}>
      <form id="prospect-master-form" onSubmit={save}>
        <ProspectBaseFields draft={draft} editing={editing && !busy} onChange={(key, value) => setDraft(previous => ({ ...previous, [key]: value }))} />
      </form>
    </ArchiveSection>
    <ArchiveSection id="followups" title={`跟进记录（${data.followups.length}）`} icon={ListChecks} action={!converted && cap.update ? <Button disabled={childLocked} onClick={() => setFollowup(true)}><Plus size={15} />新增跟进</Button> : undefined}>
      {isCreate || editing ? <p className="mb-3 text-xs text-ink-3">请先保存基础资料，再添加跟进记录。</p> : null}
      <div className="overflow-x-auto border border-line-soft"><table className="w-full text-left text-sm" aria-label="跟进记录"><thead className="bg-surface-2 text-ink-2"><tr>{["跟进日期", "跟进内容", "跟进状态", "下次跟进日期", "记录人"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium" scope="col">{label}</th>)}</tr></thead><tbody>
        {data.followups.map(item => <tr className="border-t border-line-soft" key={String(item.id)}><td className="whitespace-nowrap px-4 py-3 align-top">{item.followedOn}</td><td className="min-w-56 max-w-xl whitespace-pre-wrap break-words px-4 py-3 align-top">{item.content}</td><td className="whitespace-nowrap px-4 py-3 align-top"><ProspectStatus status={item.status} /></td><td className="whitespace-nowrap px-4 py-3 align-top">{item.nextFollowUpDate || "—"}</td><td className="whitespace-nowrap px-4 py-3 align-top">{item.createdByName || "—"}</td></tr>)}
        {!data.followups.length ? <tr><td colSpan={5} className="p-8 text-center text-ink-3">暂无跟进记录</td></tr> : null}
      </tbody></table></div>
      {followup ? <FollowupForm row={row} onClose={() => setFollowup(false)} onBusy={setBusy} onSaved={saved => { setData({ ...data, ...saved }); setDraft(saved.prospect); setFollowup(false); setNotice("跟进记录已保存"); broadcastMasterDataChanged("prospects"); }} /> : null}
    </ArchiveSection>
    <ArchiveSection id="attachments" title={`附件（${attachments.length}）`} icon={FileUp} action={!converted && cap.create ? <label className={`inline-flex h-9 items-center gap-1 rounded border border-line bg-white px-3 text-sm focus-within:ring-2 focus-within:ring-primary/35 ${childLocked ? "cursor-not-allowed text-ink-4" : "cursor-pointer text-ink-2 hover:border-primary hover:text-primary"}`}><Plus size={15} />上传附件<input type="file" multiple className="sr-only" disabled={childLocked} onChange={e => void upload(e)} /></label> : undefined}>
      {isCreate || editing ? <p className="mb-3 text-xs text-ink-3">请先保存基础资料，再上传附件。</p> : null}
      <div className="overflow-x-auto border border-line-soft"><table className="w-full text-left text-sm" aria-label="附件资料"><thead className="bg-surface-2 text-ink-2"><tr>{["附件名称", "文件大小", "上传时间", "操作"].map(label => <th className="whitespace-nowrap px-4 py-3 font-medium" key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {attachments.map(file => <tr className="border-t border-line-soft" key={file.attachmentId}><td className="min-w-48 max-w-xl break-words px-4 py-3">{file.fileName}</td><td className="whitespace-nowrap px-4 py-3">{(file.fileSize / 1024).toFixed(1)} KB</td><td className="whitespace-nowrap px-4 py-3">{formatDisplayValue(file.uploadedAt, "datetime")}</td><td className="px-4 py-3"><div className="flex gap-2"><IconLink label="下载附件" href={`${attachmentBase}/${file.attachmentId}`} download><Download size={15} /></IconLink>{!converted && cap.delete ? <IconButton disabled={childLocked} label="删除附件" tone="danger" icon={<Trash2 size={15} />} onClick={() => void removeFile(file)} /> : null}</div></td></tr>)}
        {!attachments.length ? <tr><td colSpan={4} className="p-8 text-center text-ink-3">暂无附件，可上传介绍资料、需求文件等材料。</td></tr> : null}
      </tbody></table></div>
    </ArchiveSection>
    {converting ? <ProspectConversion prospect={row} capabilities={cap} onClose={() => setConverting(false)} onDone={() => { setConverting(false); setNotice("已转为客户"); broadcastMasterDataChanged("prospects"); void load(); }} /> : null}
  </Panel>;
}

function ArchiveSection({ id, title, icon: Icon, children, action }: { id: string; title: string; icon: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return <section id={id} className="scroll-mt-20 border-t border-line-soft p-5"><div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line-soft pb-3 text-primary"><Icon size={17} /><h2 className="text-base font-medium text-ink">{title}</h2>{action ? <div className="ml-auto">{action}</div> : null}</div>{children}</section>;
}

function ProspectStatus({ status }: { status: unknown }) {
  return <span className={`inline-flex rounded px-2 py-1 text-xs ${status === "converted" ? "bg-success-soft text-success" : status === "closed" ? "bg-surface-2 text-ink-3" : "bg-info-soft text-primary"}`}>{prospectLabel(status)}</span>;
}

function FollowupForm({ row, onClose, onSaved, onBusy }: { row: ProspectRow; onClose: () => void; onSaved: (saved: Pick<Detail, "prospect" | "followups">) => void; onBusy: (busy: boolean) => void }) {
  const [draft, setDraft] = useState({ content: "", followedOn: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), nextFollowUpDate: String(row.nextFollowUpDate || ""), status: row.status === "new" ? "following" : String(row.status) });
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); onBusy(true);
    try { onSaved(await prospectRequest(`/api/prospects/${row.id}/followups`, prospectJson("POST", { ...draft, version: row.version }))); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); onBusy(false); }
  }
  return <form className="mt-4 rounded border border-info-border bg-info-soft p-4" onSubmit={save} aria-label="新增跟进记录">
    <div className="mb-4 font-medium">新增跟进记录</div>
    {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
    <fieldset disabled={saving} className="grid gap-4 md:grid-cols-3">
      <label className="text-sm">跟进日期<Input className="mt-1 w-full" type="date" required value={draft.followedOn} onChange={e => setDraft(d => ({ ...d, followedOn: e.target.value }))} /></label>
      <label className="text-sm">下次跟进日期<Input className="mt-1 w-full" type="date" value={draft.nextFollowUpDate} onChange={e => setDraft(d => ({ ...d, nextFollowUpDate: e.target.value }))} /></label>
      <label className="text-sm">跟进状态<Select className="mt-1 w-full" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>{PROSPECT_STATUSES.filter(s => s.value !== "converted").map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</Select></label>
      <label className="text-sm md:col-span-3">跟进内容<Textarea className="mt-1 w-full" rows={3} required maxLength={10000} value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} /></label>
    </fieldset>
    <div className="mt-4 flex justify-end gap-2"><Button type="button" disabled={saving} onClick={onClose}>取消</Button><Button tone="primary" type="submit" disabled={saving}><Save size={15} />{saving ? "保存中…" : "保存跟进"}</Button></div>
  </form>;
}
