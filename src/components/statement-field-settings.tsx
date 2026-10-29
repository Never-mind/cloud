"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Columns3, Eye, EyeOff } from "lucide-react";
import {
  getHiddenColumns,
  getVisibleColumns,
  mergeColumnVisibility,
  type ColumnVisibility,
  type TableColumn,
} from "@/lib/table-utils";
import { Button, Input, Select } from "./ui";
import { Modal } from "./modal";

function storageKey(tableKey: string) {
  return `cloud-power:statement-fields:${tableKey}`;
}

export function usePersistentColumnVisibility<T extends TableColumn>(tableKey: string, columns: T[]) {
  const [visibility, setVisibility] = useState<ColumnVisibility>(() => mergeColumnVisibility(columns, {}));
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(tableKey));
      if (!raw) {
        setVisibility(mergeColumnVisibility(columns, {}));
        return;
      }
      const value = JSON.parse(raw);
      const parsed = value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).filter(([, visible]) => typeof visible === "boolean")) as ColumnVisibility : {};
      setVisibility(mergeColumnVisibility(columns, parsed));
    } catch {
      setVisibility(mergeColumnVisibility(columns, {}));
    } finally {
      setLoadedKey(tableKey);
    }
  }, [columns, tableKey]);

  useEffect(() => {
    // 先恢复已有设置再写入，避免初次挂载/StrictMode 用默认值覆盖用户偏好。
    if (loadedKey !== tableKey) return;
    try {
      window.localStorage.setItem(storageKey(tableKey), JSON.stringify(visibility));
    } catch {
      // 本地偏好保存失败不影响列表使用。
    }
  }, [loadedKey, tableKey, visibility]);

  return {
    visibility,
    setVisibility,
    visibleColumns: useMemo(() => getVisibleColumns(columns, visibility), [columns, visibility]),
    hiddenColumns: useMemo(() => getHiddenColumns(columns, visibility), [columns, visibility]),
    reset: () => setVisibility(mergeColumnVisibility(columns, {})),
  };
}

export function StatementFieldSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} size="sm" tone="secondary">
      <Columns3 size={14} />
      字段设置
    </Button>
  );
}

export function StatementDetailGrid({
  fields,
  flow,
  singleRow = false,
}: {
  fields: Array<{ label: string; value: ReactNode }>;
  flow?: { payer: ReactNode; payee: ReactNode };
  singleRow?: boolean;
}) {
  return (
    <div
      className={`grid gap-px bg-line-soft ${singleRow ? "grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]" : "grid-cols-2 lg:grid-cols-4"}`}
    >
      {flow ? (
        <div className="col-span-full flex flex-wrap items-center gap-2 whitespace-normal bg-white px-3 py-2 [overflow-wrap:anywhere]">
          <span className="text-[11px] text-ink-3">收付款单位</span>
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-ink">
            <span>{flow.payer || "-"}</span>
            <span className="font-semibold text-primary">→</span>
            <span>{flow.payee || "-"}</span>
          </span>
        </div>
      ) : null}
      {fields.map((field) => (
        <div className="min-w-0 bg-white px-3 py-2" key={field.label}>
          <div className="whitespace-normal text-[11px] text-ink-3">{field.label}</div>
          <div className="mt-0.5 whitespace-normal text-xs text-ink [overflow-wrap:anywhere]">{field.value}</div>
        </div>
      ))}
    </div>
  );
}

export function StatementFieldSettingsModal<T extends TableColumn>({
  columns,
  onClose,
  onVisibilityChange,
  open,
  title,
  visibility,
}: {
  columns: T[];
  onClose: () => void;
  onVisibilityChange: (next: ColumnVisibility) => void;
  open: boolean;
  title: string;
  visibility: ColumnVisibility;
}) {
  const [keyword, setKeyword] = useState("");
  const [group, setGroup] = useState("");
  const visible = useMemo(() => getVisibleColumns(columns, visibility), [columns, visibility]);
  const hidden = useMemo(() => getHiddenColumns(columns, visibility), [columns, visibility]);
  const groups = useMemo(() => [...new Set(columns.map(column => column.group).filter((value): value is string => Boolean(value)))], [columns]);
  const matches = (column: T) => (!group || column.group === group) && `${column.label} ${column.group ?? ""}`.includes(keyword.trim());
  useEffect(() => { if (!open) { setKeyword(""); setGroup(""); } }, [open]);

  if (!open) return null;

  const toggle = (key: string, checked: boolean) => {
    onVisibilityChange({ ...visibility, [key]: checked });
  };

  return (
    <Modal
      description="勾选后直接显示在账单列表，无需展开明细。未税、税金、含税等字段可以独立选择，并按业务顺序排列。"
      footer={
        <>
          <Button onClick={() => onVisibilityChange(mergeColumnVisibility(columns, {}))}>恢复默认</Button>
          <Button tone="primary" onClick={onClose}>确定</Button>
        </>
      }
      onClose={onClose}
      title={title}
      widthClass="max-w-[760px]"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="搜索字段" className="min-w-0 flex-1" placeholder="搜索字段，如未税、税金、发票号" value={keyword} onChange={event => setKeyword(event.target.value)} />
        {groups.length ? <Select aria-label="字段分组" value={group} onChange={event => setGroup(event.target.value)}>
          <option value="">全部分组</option>
          {groups.map(value => <option key={value} value={value}>{value}</option>)}
        </Select> : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FieldGroup columns={visible.filter(matches)} icon="visible" title={`已显示（${visible.length}）`} visibility={visibility} onToggle={toggle} />
        <FieldGroup columns={hidden.filter(matches)} icon="hidden" title={`已隐藏（${hidden.length}）`} visibility={visibility} onToggle={toggle} />
      </div>
      <div className="mt-4 rounded border border-line-soft bg-surface-2 px-3 py-2 text-xs leading-5 text-ink-3">
        例如：勾选“客户应收（未税）”，取消“客户应收（含税）”，即可直接查看未税金额。设置保存在当前浏览器；这里只控制展示，不会修改账单数据。
      </div>
    </Modal>
  );
}

function FieldGroup<T extends TableColumn>({
  columns,
  icon,
  onToggle,
  title,
  visibility,
}: {
  columns: T[];
  icon: "visible" | "hidden";
  onToggle: (key: string, checked: boolean) => void;
  title: string;
  visibility: ColumnVisibility;
}) {
  const groups = new Map<string, T[]>();
  for (const column of columns) {
    const name = column.group ?? "字段";
    const fields = groups.get(name) ?? [];
    fields.push(column);
    groups.set(name, fields);
  }
  return (
    <div className="rounded border border-line-soft">
      <div className="flex items-center gap-2 border-b border-line-soft bg-canvas px-3 py-2 text-sm font-medium text-ink">
        {icon === "visible" ? <Eye size={15} /> : <EyeOff size={15} />}
        {title}
      </div>
      <div className="max-h-[360px] space-y-3 overflow-auto p-3">
        {[...groups].map(([name, fields]) => <fieldset className="min-w-0" key={name}>
          <legend className="mb-2 text-xs font-medium text-ink-3">{name}</legend>
          <div className="grid gap-2 sm:grid-cols-2">{fields.map((column) => (
          <label className="flex min-w-0 items-center gap-2 rounded border border-line-soft bg-white px-2.5 py-2 text-xs text-ink-2" key={column.key}>
            <input
              checked={visibility[column.key] ?? column.defaultVisible !== false}
              className="h-4 w-4 shrink-0"
              type="checkbox"
              onChange={(event) => onToggle(column.key, event.target.checked)}
            />
            <span className="min-w-0 whitespace-normal break-words">{column.label}</span>
          </label>
        ))}</div></fieldset>)}
        {!columns.length ? <div className="py-8 text-center text-xs text-ink-3">暂无匹配字段</div> : null}
      </div>
    </div>
  );
}
