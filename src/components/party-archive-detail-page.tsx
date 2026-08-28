"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, Building2, Download, Edit3, FileUp, Landmark, Plus, RefreshCw, Save, Tag, Trash2, UserRound } from "lucide-react";
import { fetchAllEntityRows } from "@/lib/client-entity-fetch";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import type { EntityConfig, EntityField } from "@/lib/modules";
import { Button, Input, Panel, Textarea } from "./ui";

type Row = Record<string, string | number | boolean | null>;

type Attachment = {
  attachmentId: string;
  fileName: string;
  fileType?: string | null;
  fileSize: number;
  uploadedAt?: string | null;
};

const PARTY_KEYS = new Set(["suppliers", "customers", "undertaking-units"]);
const BASE_EXCLUDED_FIELDS = new Set(["supplyCategories", "brands", "businessTypes", "contactName", "contactPhone", "contactEmail", "bankAccount"]);
const SUPPLY_CATEGORY_OPTIONS = ["服务器", "配件", "云服务", "货运", "清关", "人力", "税代", "融资", "音视频"];
const CUSTOMER_BUSINESS_OPTIONS = ["算力业务", "集采业务", "华为云业务"];

export function PartyArchiveDetailPage({ config, id, related }: { config: EntityConfig; id: string; related: EntityConfig[] }) {
  const router = useRouter();
  const isCreate = id === "new";
  const [record, setRecord] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const [editing, setEditing] = useState(isCreate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingRelatedRows, setPendingRelatedRows] = useState<Record<string, Row[]>>({});

  async function load() {
    setLoading(true);
    setError("");
    if (isCreate) {
      const initial = Object.fromEntries(
        config.formFields
          .filter((field) => !field.hidden)
          .map((field) => [field.key, field.options?.[0]?.value ?? (field.type === "boolean" ? false : "")]),
      ) as Row;
      setRecord(initial);
      setDraft(initial);
      setAttachments([]);
      setPendingRelatedRows({});
      setEditing(true);
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/entities/${config.key}/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "基础信息加载失败");
      setRecord(data);
      setDraft(data);
      const attachmentResponse = await fetch(`/api/common/attachments/${encodeURIComponent(config.key)}/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (attachmentResponse.ok) {
        const attachmentData = await attachmentResponse.json().catch(() => ({}));
        setAttachments((attachmentData.attachments ?? []) as Attachment[]);
      }
    } catch (loadError) {
      setRecord(null);
      setError(loadError instanceof Error ? loadError.message : "基础信息加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [config.key, id, isCreate]);

  function cancelEditing() {
    if (isCreate) {
      router.push(config.route);
      return;
    }
    setDraft(record ?? {});
    setEditing(false);
    setError("");
  }

  async function save() {
    const missing = config.formFields.find((field) => field.required && !field.hidden && String(draft[field.key] ?? "").trim() === "");
    if (missing) {
      setError(`请先填写${config.title}基础信息：${missing.label}`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const body = Object.fromEntries(config.formFields.map((field) => [field.key, normalizeFieldValue(field, draft[field.key])]));
      const response = await fetch(isCreate ? `/api/entities/${config.key}` : `/api/entities/${config.key}/${encodeURIComponent(id)}`, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "基础信息保存失败");
      if (isCreate) {
        const savedId = String(data[config.primaryKey] ?? "").trim();
        if (!savedId) throw new Error("保存成功，但未返回档案编号");
        for (const relatedConfig of related) {
          const rows = pendingRelatedRows[relatedConfig.key] ?? [];
          const ownerField = relatedConfig.formFields.find((field) => field.key.endsWith("Id") && field.key !== relatedConfig.primaryKey)?.key;
          if (!ownerField) continue;
          for (const row of rows) {
            const body = Object.fromEntries(
              relatedConfig.formFields
                .filter((field) => field.key !== relatedConfig.primaryKey)
                .map((field) => [field.key, normalizeFieldValue(field, field.key === ownerField ? savedId : row[field.key])]),
            );
            const relatedResponse = await fetch(`/api/entities/${relatedConfig.key}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            const relatedData = await relatedResponse.json().catch(() => ({}));
            if (!relatedResponse.ok) throw new Error(relatedData.error ?? `${relatedConfig.title}保存失败`);
          }
        }
        router.replace(`${config.detailRoute}/${encodeURIComponent(savedId)}`);
        return;
      }
      setRecord(data);
      setDraft(data);
      setEditing(false);
      setNotice(`${config.title}档案已保存`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "基础信息保存失败");
    } finally {
      setSaving(false);
    }
  }

  const nameKey = config.key === "suppliers" ? "nameCn" : config.key === "undertaking-units" ? "entityName" : "name";
  const codeKey = config.listFields.find((field) => /Code$/.test(field.key))?.key ?? config.primaryKey;
  const baseFields = config.formFields.filter((field) => !field.hidden && field.key !== config.primaryKey && !BASE_EXCLUDED_FIELDS.has(field.key));
  const scopeFields = config.formFields.filter((field) => ["supplyCategories", "brands", "businessTypes"].includes(field.key));
  const isParty = PARTY_KEYS.has(config.key);
  const tabItems = [
    { id: "basic-info", label: "基础资料" },
    ...(scopeFields.length ? [{ id: "business-scope", label: "经营范围" }] : []),
    { id: "bank-accounts", label: "银行账户" },
    { id: "contacts", label: "联系人" },
    { id: "attachments", label: "附件" },
  ];

  if (loading) return <Panel className="p-10 text-center text-sm text-[#909399]">正在加载{config.title}档案...</Panel>;
  if (!record) return <Panel className="p-10 text-center text-sm text-[#f56c6c]">{error || `未找到${config.title}`}</Panel>;

  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-[#ebeef5] px-5 py-4">
          <Link className="inline-flex h-9 w-9 items-center justify-center border border-[#dcdfe6] bg-white text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]" href={config.route} aria-label={`返回${config.title}`} title={`返回${config.title}`}>
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-medium text-[#303133]">{String(record[nameKey] || record.nameCn || (isCreate ? `新建${config.title}` : config.title))}</h1>
            <div className="mt-1 font-mono text-xs text-[#909399]">{String(record[codeKey] || (isCreate ? "新建档案" : id))}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!isCreate ? <div className="mr-2 text-xs text-[#909399]">
              <span>创建 {formatDisplayValue(record.createdAt, "datetime")}</span>
              <span className="mx-2">更新 {formatDisplayValue(record.updatedAt, "datetime")}</span>
            </div> : null}
            {editing || isCreate ? (
              <>
                <Button onClick={cancelEditing} disabled={saving}>取消</Button>
                <Button tone="primary" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? "保存中..." : "保存"}</Button>
              </>
            ) : (
              <Button tone="primary" onClick={() => { setNotice(""); setEditing(true); }}><Edit3 size={15} />修改</Button>
            )}
            <Button className="h-9 w-9 px-0" onClick={() => void load()} aria-label="刷新" title="刷新"><RefreshCw size={15} /></Button>
          </div>
        </header>
        {error ? <div className="border-b border-[#fde2e2] bg-[#fef0f0] px-5 py-3 text-sm text-[#f56c6c]">{error}</div> : null}
        {notice ? <div className="border-b border-[#c2e7b0] bg-[#f0f9eb] px-5 py-3 text-sm text-[#67c23a]">{notice}</div> : null}

        <nav className="flex overflow-x-auto border-b border-[#ebeef5] bg-white px-5" aria-label="档案分区">
          {tabItems.map((tab, index) => <a className={`whitespace-nowrap border-b-2 px-1 py-3 mr-7 text-sm ${index === 0 ? "border-[#1890ff] text-[#1890ff]" : "border-transparent text-[#606266] hover:text-[#1890ff]"}`} href={`#${tab.id}`} key={tab.id}>{tab.label}</a>)}
        </nav>

        <ArchiveSection id="basic-info" title="基础资料" icon={Building2}>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-4">
            {baseFields.map((field) => <FieldEditor field={field} editing={editing} key={field.key} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />)}
          </div>
        </ArchiveSection>

        {isParty && scopeFields.length ? (
          <ArchiveSection id="business-scope" title="经营范围" icon={Tag}>
            <div className="grid gap-5 md:grid-cols-2">
              {scopeFields.map((field) => <ScopeFieldEditor field={field} editing={editing} key={field.key} value={draft[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />)}
            </div>
          </ArchiveSection>
        ) : null}

        <div id="bank-accounts">{related.filter((item) => item.title.includes("银行")).map((item) => <RelatedSection config={item} ownerId={id} editing={editing} enabled key={item.key} pendingRows={pendingRelatedRows[item.key] ?? []} persisted={!isCreate} onPendingRowsChange={(rows) => setPendingRelatedRows((current) => ({ ...current, [item.key]: rows }))} onError={setError} />)}</div>
        <div id="contacts">{related.filter((item) => item.title.includes("联系人")).map((item) => <RelatedSection config={item} ownerId={id} editing={editing} enabled key={item.key} pendingRows={pendingRelatedRows[item.key] ?? []} persisted={!isCreate} onPendingRowsChange={(rows) => setPendingRelatedRows((current) => ({ ...current, [item.key]: rows }))} onError={setError} />)}</div>
        <div id="attachments"><AttachmentsSection config={config} ownerId={id} attachments={attachments} editing={editing && !isCreate} onAttachmentsChange={setAttachments} onError={setError} /></div>
      </Panel>
    </div>
  );
}

function ArchiveSection({ id, title, icon: Icon, children }: { id: string; title: string; icon: typeof Building2; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-20 border-t border-[#ebeef5] p-5"><div className="mb-4 flex items-center gap-2 border-b border-[#ebeef5] pb-3 text-[#1890ff]"><Icon size={17} /><h2 className="text-base font-medium text-[#303133]">{title}</h2></div>{children}</section>;
}

function ScopeFieldEditor({ field, value, editing, onChange }: { field: EntityField; value: Row[string]; editing: boolean; onChange: (value: Row[string]) => void }) {
  if (field.key === "supplyCategories") return <TagCheckboxEditor field={field} options={SUPPLY_CATEGORY_OPTIONS} value={value} editing={editing} onChange={onChange} />;
  if (field.key === "businessTypes") return <TagCheckboxEditor field={field} options={CUSTOMER_BUSINESS_OPTIONS} value={value} editing={editing} onChange={onChange} />;
  return <TagListEditor field={field} value={value} editing={editing} onChange={onChange} />;
}

function TagCheckboxEditor({ field, options, value, editing, onChange }: { field: EntityField; options: string[]; value: Row[string]; editing: boolean; onChange: (value: Row[string]) => void }) {
  const [input, setInput] = useState("");
  const selected = parseTags(value);
  const customOptions = selected.filter((item) => !options.includes(item));
  const toggle = (item: string) => onChange(joinTags(selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]));
  const add = () => {
    const next = input.trim();
    if (!next || selected.includes(next)) return;
    onChange(joinTags([...selected, next]));
    setInput("");
  };
  return <div className="md:col-span-2"><span className="mb-2 block text-xs text-[#606266]">{field.label}</span><div className="flex flex-wrap gap-x-5 gap-y-3">{[...options, ...customOptions].map((item) => <label className="inline-flex items-center gap-2 text-sm text-[#606266]" key={item}><input checked={selected.includes(item)} disabled={!editing} type="checkbox" onChange={() => toggle(item)} />{item}</label>)}</div><div className="mt-3 flex gap-2"><Input className="min-w-0 flex-1" disabled={!editing} placeholder={`输入其他${field.label}后按回车添加`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><Button disabled={!editing || !input.trim()} onClick={add}><Plus size={15} />添加</Button></div></div>;
}

function TagListEditor({ field, value, editing, onChange }: { field: EntityField; value: Row[string]; editing: boolean; onChange: (value: Row[string]) => void }) {
  const [input, setInput] = useState("");
  const tags = parseTags(value);
  const add = () => {
    const next = input.trim();
    if (!next || tags.includes(next)) return;
    onChange(joinTags([...tags, next]));
    setInput("");
  };
  return <div className="md:col-span-2"><span className="mb-2 block text-xs text-[#606266]">{field.label}</span><div className="flex gap-2"><Input className="min-w-0 flex-1" disabled={!editing} placeholder={`输入${field.label}后按回车添加`} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><Button disabled={!editing || !input.trim()} onClick={add}><Plus size={15} />添加</Button></div><div className="mt-2 flex min-h-8 flex-wrap gap-2">{tags.map((tag) => <span className="inline-flex items-center gap-1 bg-[#ecf5ff] px-2 py-1 text-xs text-[#409eff]" key={tag}>{tag}{editing ? <button className="text-[#79bbff] hover:text-[#1890ff]" type="button" onClick={() => onChange(joinTags(tags.filter((value) => value !== tag)))}>x</button> : null}</span>)}</div></div>;
}

function parseTags(value: Row[string]) {
  return String(value ?? "").split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean);
}

function joinTags(values: string[]) {
  return Array.from(new Set(values)).join(",");
}

function FieldEditor({ field, value, editing, onChange }: { field: EntityField; value: Row[string]; editing: boolean; onChange: (value: Row[string]) => void }) {
  const inputValue = field.type === "date"
    ? formatDateInputValue(value)
    : field.type === "percentage" && value !== null && value !== undefined && value !== ""
      ? String(Number(value) * 100)
      : String(value ?? "");
  const wide = field.type === "textarea";

  return (
    <label className={wide ? "block md:col-span-2 lg:col-span-4" : "block"}>
      <span className="mb-1 block text-xs text-[#606266]">{field.label}{field.required ? <b className="text-[#f56c6c]"> *</b> : null}</span>
      {wide ? (
        <Textarea className="min-h-20 w-full disabled:bg-[#f5f7fa] disabled:text-[#606266]" disabled={!editing} required={field.required} value={inputValue} onChange={(event) => onChange(event.target.value)} />
      ) : field.type === "boolean" ? (
        <span className="flex h-9 items-center gap-2 text-sm text-[#606266]"><input checked={Boolean(value)} disabled={!editing} type="checkbox" onChange={(event) => onChange(event.target.checked)} />{Boolean(value) ? "是" : "否"}</span>
      ) : field.type === "select" && field.allowCustom ? (
        <>
          <Input className="w-full disabled:bg-[#f5f7fa] disabled:text-[#606266]" disabled={!editing} list={`party-${field.key}-options`} required={field.required} value={inputValue} onChange={(event) => onChange(event.target.value)} />
          <datalist id={`party-${field.key}-options`}>
            {field.options?.map((option) => <option key={option.value} label={option.label} value={option.value} />)}
          </datalist>
        </>
      ) : field.type === "select" ? (
        <select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm disabled:bg-[#f5f7fa] disabled:text-[#606266]" disabled={!editing} required={field.required} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">请选择</option>
          {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <Input className="w-full disabled:bg-[#f5f7fa] disabled:text-[#606266]" disabled={!editing} required={field.required} type={field.type === "number" || field.type === "money" || field.type === "percentage" ? "number" : field.type === "date" ? "date" : "text"} value={inputValue} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function RelatedSection({ config, ownerId, editing, enabled, persisted, pendingRows, onPendingRowsChange, onError }: {
  config: EntityConfig;
  ownerId: string;
  editing: boolean;
  enabled: boolean;
  persisted: boolean;
  pendingRows: Row[];
  onPendingRowsChange: (rows: Row[]) => void;
  onError: (value: string) => void;
}) {
  const ownerKey = config.formFields.find((field) => field.key.endsWith("Id") && field.key !== config.primaryKey)?.key ?? "";
  const [rows, setRows] = useState<Row[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Row>({ [ownerKey]: ownerId });
  const [saving, setSaving] = useState(false);
  const isBank = config.title.includes("银行");
  const defaultKey = isBank ? "isDefault" : "isPrimary";
  const fields = config.formFields.filter((field) => !field.hidden && field.key !== config.primaryKey && field.key !== ownerKey && field.key !== defaultKey);
  const visibleRows = persisted ? rows : pendingRows;

  async function load() {
    if (!ownerKey || !enabled || !persisted) {
      setRows([]);
      return;
    }
    try {
      setRows(await fetchAllEntityRows<Row>(config.key, { [ownerKey]: ownerId }));
    } catch (loadError) {
      onError(loadError instanceof Error ? loadError.message : `${config.title}加载失败`);
    }
  }

  useEffect(() => { void load(); }, [config.key, ownerId, enabled, persisted]);
  useEffect(() => { if (!editing) { setEditingId(null); setDraft({ [ownerKey]: ownerId }); } }, [editing, ownerId, ownerKey]);

  function openNew() {
    if (!editing || !enabled) return;
    setEditingId("");
    setDraft({ [ownerKey]: ownerId, ...(isBank ? { currency: "USD" } : {}), [defaultKey]: visibleRows.length === 0 });
  }

  function openEdit(row: Row) {
    if (!editing || !enabled) return;
    setEditingId(String(row[config.primaryKey]));
    setDraft(row);
  }

  async function toggleDefault(row: Row, checked: boolean) {
    if (!editing || !enabled) return;
    const rowId = String(row[config.primaryKey]);
    if (!persisted) {
      const nextRows = visibleRows.map((item) => ({
        ...item,
        [defaultKey]: checked ? String(item[config.primaryKey]) === rowId : Boolean(item[defaultKey]) && String(item[config.primaryKey]) !== rowId,
      }));
      onPendingRowsChange(nextRows);
      if (editingId === rowId) setDraft((current) => ({ ...current, [defaultKey]: checked }));
      return;
    }
    if (editingId === rowId) {
      setDraft((current) => ({ ...current, [defaultKey]: checked }));
      return;
    }
    const body = Object.fromEntries(config.formFields.map((field) => [
      field.key,
      normalizeFieldValue(field, field.key === ownerKey ? ownerId : field.key === defaultKey ? checked : row[field.key]),
    ]));
    setSaving(true);
    try {
      const response = await fetch(`/api/entities/${config.key}/${encodeURIComponent(rowId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `${config.title}保存失败`);
      await load();
    } catch (toggleError) {
      onError(toggleError instanceof Error ? toggleError.message : `${config.title}保存失败`);
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const missing = config.formFields.find((field) => field.required && String(draft[field.key] ?? "").trim() === "");
    if (missing) {
      onError(`请填写${missing.label}`);
      return;
    }
    setSaving(true);
    try {
      const body = Object.fromEntries(config.formFields.map((field) => [field.key, normalizeFieldValue(field, field.key === ownerKey ? ownerId : draft[field.key])]));
      if (!persisted) {
        const pendingId = editingId || `${config.key}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const nextRow = { ...body, [config.primaryKey]: pendingId, [ownerKey]: ownerId };
        const nextRows = editingId
          ? visibleRows.map((row) => String(row[config.primaryKey]) === editingId ? nextRow : row)
          : [...visibleRows, nextRow];
        onPendingRowsChange(body[defaultKey] ? nextRows.map((row) => ({ ...row, [defaultKey]: String(row[config.primaryKey]) === pendingId })) : nextRows);
        setEditingId(null);
        setDraft({ [ownerKey]: ownerId });
        return;
      }
      const response = await fetch(`/api/entities/${config.key}${editingId ? `/${encodeURIComponent(editingId)}` : ""}`, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? `${config.title}保存失败`);
      setEditingId(null);
      setDraft({ [ownerKey]: ownerId });
      await load();
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : `${config.title}保存失败`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!editing || !window.confirm(`确认删除这条${config.title}吗？`)) return;
    if (!persisted) {
      onPendingRowsChange(visibleRows.filter((item) => String(item[config.primaryKey]) !== String(row[config.primaryKey])));
      if (editingId === String(row[config.primaryKey])) setEditingId(null);
      return;
    }
    const response = await fetch(`/api/entities/${config.key}/${encodeURIComponent(String(row[config.primaryKey]))}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      onError(data.error ?? `${config.title}删除失败`);
      return;
    }
    await load();
  }

  return (
    <section className="border-t border-[#ebeef5] p-5">
      <div className="mb-4 flex items-center gap-2 border-b border-[#ebeef5] pb-3 text-[#1890ff]">{isBank ? <Landmark size={17} /> : <UserRound size={17} />}<h2 className="text-base font-medium text-[#303133]">{isBank ? "银行账户" : "联系人"}</h2><Button className="ml-auto" tone="primary" disabled={!editing || !enabled} onClick={openNew}><Plus size={15} />新增{isBank ? "账户" : "联系人"}</Button></div>
      <div className="space-y-3">
        {visibleRows.map((row, index) => {
          const rowId = String(row[config.primaryKey]);
          const rowEditing = editingId === rowId;
          const rowValue = rowEditing ? draft : row;
          return <div className="border border-[#ebeef5] p-4" key={rowId}>
            <div className="mb-3 flex flex-wrap items-start gap-3"><strong className="text-sm text-[#303133]">{isBank ? `账户 ${index + 1}` : `联系人 ${index + 1}`}</strong><label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-[#606266]"><input checked={Boolean(rowValue[defaultKey])} disabled={!editing} type="checkbox" onChange={(event) => void toggleDefault(row, event.target.checked)} />{isBank ? "默认账户" : "默认联系人"}</label>{editing ? <div className="flex items-center gap-3"><button className="text-sm text-[#1890ff]" type="button" onClick={() => openEdit(row)}>编辑</button><button className="text-sm text-[#f56c6c]" type="button" onClick={() => void remove(row)}>删除</button></div> : null}</div>
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <FieldEditor field={field} editing={rowEditing} key={field.key} value={rowValue[field.key]} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />)}</div>
          </div>;
        })}
        {!visibleRows.length ? <div className="border border-dashed border-[#dcdfe6] px-4 py-8 text-center text-sm text-[#909399]">暂无{isBank ? "银行账户" : "联系人"}</div> : null}
      </div>
      {editingId !== null ? <form className="mt-4 border border-[#b3d8ff] bg-[#f4faff] p-4" onSubmit={save}><div className="mb-3 flex items-center"><strong className="text-sm text-[#303133]">{editingId ? `编辑${isBank ? "银行账户" : "联系人"}` : `新增${isBank ? "银行账户" : "联系人"}`}</strong><button className="ml-auto text-sm text-[#909399]" type="button" onClick={() => setEditingId(null)}>取消</button></div><div className="grid gap-x-5 gap-y-4 md:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <FieldEditor field={field} editing value={draft[field.key]} key={field.key} onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))} />)}</div><div className="mt-4 flex justify-end"><Button tone="primary" type="submit" disabled={saving}><Save size={15} />{saving ? "保存中..." : "保存"}</Button></div></form> : null}
    </section>
  );
}

function AttachmentsSection({ config, ownerId, attachments, editing, onAttachmentsChange, onError }: { config: EntityConfig; ownerId: string; attachments: Attachment[]; editing: boolean; onAttachmentsChange: (value: Attachment[]) => void; onError: (value: string) => void }) {
  const [uploading, setUploading] = useState<string[]>([]);

  async function load() {
    const response = await fetch(`/api/common/attachments/${encodeURIComponent(config.key)}/${encodeURIComponent(ownerId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "附件加载失败");
    onAttachmentsChange((data.attachments ?? []) as Attachment[]);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !editing) return;
    const rejected = files.find((file) => file.size > 10 * 1024 * 1024);
    if (rejected) { onError(`文件“${rejected.name}”超过 10 MB 限制`); return; }
    setUploading(files.map((file) => file.name));
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.set("file", file);
        const response = await fetch(`/api/common/attachments/${encodeURIComponent(config.key)}/${encodeURIComponent(ownerId)}`, { method: "POST", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `${file.name}上传失败`);
        setUploading((current) => current.filter((name) => name !== file.name));
      }
      await load();
    } catch (uploadError) {
      onError(uploadError instanceof Error ? uploadError.message : "附件上传失败");
    } finally {
      setUploading([]);
    }
  }

  async function remove(attachment: Attachment) {
    if (!editing || !window.confirm(`确认删除附件“${attachment.fileName}”吗？`)) return;
    const response = await fetch(`/api/common/attachments/${encodeURIComponent(config.key)}/${encodeURIComponent(ownerId)}/${encodeURIComponent(attachment.attachmentId)}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json().catch(() => ({})); onError(data.error ?? "附件删除失败"); return; }
    await load();
  }

  return <section className="border-t border-[#ebeef5] p-5"><div className="mb-4 flex items-center gap-2 border-b border-[#ebeef5] pb-3 text-[#1890ff]"><FileUp size={17} /><h2 className="text-base font-medium text-[#303133]">附件</h2><label className={`ml-auto inline-flex h-9 items-center gap-1 border border-[#dcdfe6] bg-white px-3 text-sm ${!editing || uploading.length ? "cursor-not-allowed text-[#c0c4cc]" : "cursor-pointer text-[#606266] hover:border-[#1890ff] hover:text-[#1890ff]"}`}><Plus size={15} />上传附件<input className="hidden" disabled={!editing || uploading.length > 0} type="file" multiple onChange={(event) => void upload(event)} /></label></div><div className="divide-y divide-[#ebeef5] border border-[#ebeef5]">{uploading.map((name) => <div className="flex items-center gap-3 px-4 py-3 text-sm" key={name}><FileUp className="text-[#1890ff]" size={17} /><div><strong>{name}</strong><div className="text-xs text-[#909399]">上传中...</div></div></div>)}{attachments.map((attachment) => <div className="flex items-center gap-3 px-4 py-3 text-sm" key={attachment.attachmentId}><FileUp className="text-[#909399]" size={17} /><div className="min-w-0 flex-1"><strong className="block truncate">{attachment.fileName}</strong><div className="text-xs text-[#909399]">{formatBytes(attachment.fileSize)} · {attachment.uploadedAt ? formatDisplayValue(attachment.uploadedAt, "datetime") : ""}</div></div><div className="flex items-center gap-3"><a className="inline-flex items-center gap-1 text-[#1890ff] hover:underline" download href={`/api/common/attachments/${encodeURIComponent(config.key)}/${encodeURIComponent(ownerId)}/${encodeURIComponent(attachment.attachmentId)}`}><Download size={15} />下载</a><button className="inline-flex items-center gap-1 text-[#f56c6c] disabled:cursor-not-allowed disabled:text-[#c0c4cc]" disabled={!editing} type="button" onClick={() => void remove(attachment)}><Trash2 size={15} />删除</button></div></div>)}{!attachments.length && !uploading.length ? <div className="px-4 py-8 text-center text-sm text-[#909399]">暂无附件</div> : null}</div></section>;
}

function formatBytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function normalizeFieldValue(field: EntityField, value: Row[string]) {
  if (field.type === "boolean") return Boolean(value);
  if (field.type === "number" || field.type === "money") return value === "" || value === null || value === undefined ? null : Number(value);
  if (field.type === "percentage") return value === "" || value === null || value === undefined ? null : Number(value) / 100;
  return value === "" || value === undefined ? null : value;
}
