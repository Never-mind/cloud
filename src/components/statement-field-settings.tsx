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
import { Button } from "./ui";
import { Modal } from "./modal";

function storageKey(tableKey: string) {
  return `cloud-power:statement-fields:${tableKey}`;
}

export function usePersistentColumnVisibility<T extends TableColumn>(tableKey: string, columns: T[]) {
  const [visibility, setVisibility] = useState<ColumnVisibility>(() => mergeColumnVisibility(columns, {}));

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(tableKey));
      if (!raw) {
        setVisibility(mergeColumnVisibility(columns, {}));
        return;
      }
      const parsed = JSON.parse(raw) as ColumnVisibility;
      setVisibility(mergeColumnVisibility(columns, parsed));
    } catch {
      setVisibility(mergeColumnVisibility(columns, {}));
    }
  }, [columns, tableKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(tableKey), JSON.stringify(visibility));
    } catch {
      // 本地偏好保存失败不影响列表使用。
    }
  }, [tableKey, visibility]);

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
      className={`grid gap-px bg-line-soft ${singleRow ? "overflow-x-auto" : "grid-cols-2 lg:grid-cols-4"}`}
      style={singleRow ? { gridAutoFlow: "column", gridAutoColumns: "minmax(150px, 1fr)" } : undefined}
    >
      {flow ? (
        <div className="col-span-full flex flex-wrap items-center gap-2 bg-white px-3 py-2">
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
          <div className="text-[11px] text-ink-3">{field.label}</div>
          <div className="mt-0.5 break-words text-xs text-ink">{field.value}</div>
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
  const visible = useMemo(() => getVisibleColumns(columns, visibility), [columns, visibility]);
  const hidden = useMemo(() => getHiddenColumns(columns, visibility), [columns, visibility]);

  if (!open) return null;

  const toggle = (key: string, checked: boolean) => {
    onVisibilityChange({ ...visibility, [key]: checked });
  };

  return (
    <Modal
      description="勾选需要显示的字段。再次显示隐藏字段时，会按固定业务顺序回到原位置。"
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
      <div className="grid gap-4 md:grid-cols-2">
        <FieldGroup columns={visible} icon="visible" title={`已显示（${visible.length}）`} visibility={visibility} onToggle={toggle} />
        <FieldGroup columns={hidden} icon="hidden" title={`已隐藏（${hidden.length}）`} visibility={visibility} onToggle={toggle} />
      </div>
      <div className="mt-4 rounded border border-line-soft bg-surface-2 px-3 py-2 text-xs leading-5 text-ink-3">
        筛选能力仍由原字段提供；这里只控制列表展示，不会修改数据。
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
  return (
    <div className="rounded border border-line-soft">
      <div className="flex items-center gap-2 border-b border-line-soft bg-canvas px-3 py-2 text-sm font-medium text-ink">
        {icon === "visible" ? <Eye size={15} /> : <EyeOff size={15} />}
        {title}
      </div>
      <div className="grid max-h-[360px] gap-2 overflow-auto p-3 sm:grid-cols-2">
        {columns.map((column) => (
          <label className="flex min-w-0 items-center gap-2 rounded border border-line-soft bg-white px-2.5 py-2 text-xs text-ink-2" key={column.key}>
            <input
              checked={visibility[column.key] ?? column.defaultVisible !== false}
              className="h-4 w-4 shrink-0"
              type="checkbox"
              onChange={(event) => onToggle(column.key, event.target.checked)}
            />
            <span className="truncate" title={column.label}>{column.label}</span>
          </label>
        ))}
        {!columns.length ? <div className="col-span-full py-8 text-center text-xs text-ink-3">暂无字段</div> : null}
      </div>
    </div>
  );
}
