"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Columns3, Eye, EyeOff, FileDown, FileSpreadsheet, Plus, Search, Trash2, Upload } from "lucide-react";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { buildImportMessage, type ImportReport } from "@/lib/entity-import";
import { getInstanceContractModelAutofill } from "@/lib/instance-contract-form";
import type { EntityConfig } from "@/lib/modules";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import {
  getColumnSettingGroups,
  getHiddenColumns,
  getVisibleColumns,
  mergeColumnVisibility,
  type ColumnVisibility,
} from "@/lib/table-utils";
import { PaginationBar } from "./pagination-bar";
import { Button, Input, Panel, Textarea } from "./ui";

type Row = Record<string, string | number | boolean | null>;

export function EntityPage({
  config,
  hideCreateImportTemplate = false,
}: {
  config: EntityConfig;
  hideCreateImportTemplate?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [instanceContracts, setInstanceContracts] = useState<Row[]>([]);
  const [instanceContractDeviceCode, setInstanceContractDeviceCode] = useState("");
  const [billingContractNo, setBillingContractNo] = useState("");
  const [visibility, setVisibility] = useState<ColumnVisibility>(() =>
    mergeColumnVisibility(config.listFields, {}),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const visibleColumns = useMemo(
    () => getVisibleColumns(config.listFields, visibility),
    [config.listFields, visibility],
  );
  const hiddenColumns = useMemo(
    () => getHiddenColumns(config.listFields, visibility),
    [config.listFields, visibility],
  );
  const columnSettingGroups = useMemo(
    () => getColumnSettingGroups(config.listFields, visibility),
    [config.listFields, visibility],
  );

  async function loadRows(next?: { page?: number; pageSize?: number; keyword?: string; filterValues?: Record<string, string> }) {
    setLoading(true);
    const nextPage = next?.page ?? page;
    const nextPageSize = next?.pageSize ?? pageSize;
    const nextKeyword = next?.keyword ?? keyword;
    const nextFilterValues = next?.filterValues ?? filterValues;
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(nextPageSize),
      keyword: nextKeyword,
    });
    for (const [key, value] of Object.entries(nextFilterValues)) {
      if (value.trim()) params.set(key, value.trim());
    }
    const response = await fetch(`/api/entities/${config.key}?${params.toString()}`);
    const data = await response.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    void loadRows();
  }, [config.key, page, pageSize]);

  useEffect(() => {
    if (config.key !== "instance-contracts") return;

    void fetch("/api/entities/instance-models?page=1&pageSize=100")
      .then((response) => response.json())
      .then((data) => setInstanceModels(data.rows ?? []));
  }, [config.key]);

  useEffect(() => {
    if (config.key !== "billing-ledgers") return;

    void fetch("/api/entities/instance-contracts?page=1&pageSize=100")
      .then((response) => response.json())
      .then((data) => setInstanceContracts(data.rows ?? []));
  }, [config.key]);

  const instanceContractAutofill = useMemo(
    () =>
      getInstanceContractModelAutofill(
        instanceContractDeviceCode,
        instanceModels.map((model) => ({
          deviceCode: String(model.deviceCode ?? ""),
          modelCode: String(model.modelCode ?? ""),
          nameEn: String(model.nameEn ?? ""),
        })),
      ),
    [instanceContractDeviceCode, instanceModels],
  );
  const selectedBillingContract = useMemo(
    () => findBillingContract(instanceContracts, editing, billingContractNo),
    [billingContractNo, editing, instanceContracts],
  );

  async function saveRow(formData: FormData) {
    if (config.key === "billing-ledgers" && !confirm("确认调整该月账单台账吗？调整后会重新生成对应的每月核销明细。")) {
      return;
    }
    const body = Object.fromEntries(
      config.formFields.map((field) => {
        const value = formData.get(field.key);
        if (field.type === "boolean") return [field.key, value === "on"];
        if (field.type === "number") return [field.key, value === "" ? null : Number(value)];
        return [field.key, value === "" ? null : value];
      }),
    );
    const id = editing?.[config.primaryKey];
    const response = await fetch(`/api/entities/${config.key}${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error ?? "保存失败");
      return;
    }
    setShowForm(false);
    setEditing(null);
    setBillingContractNo("");
    await loadRows();
  }

  async function deleteRow(row: Row) {
    const message =
      config.key === "billing-ledgers"
        ? `确认删除月账单台账 ${String(row[config.primaryKey])} 吗？删除后对应的每月核销明细也会同步删除。`
        : `确认删除 ${String(row[config.primaryKey])}？`;
    if (!confirm(message)) return;
    const response = await fetch(`/api/entities/${config.key}/${row[config.primaryKey]}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error ?? "删除失败");
      return;
    }
    await loadRows();
  }

  async function importFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/entities/${config.key}/import`, { method: "POST", body: formData });
    const result = (await response.json()) as ImportReport | { error?: string };
    if (!response.ok) {
      alert(`导入失败：${"error" in result ? result.error : "文件处理失败"}`);
      return;
    }
    alert(buildImportMessage(result as ImportReport));
    await loadRows();
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-medium text-[#303133]">{config.title}</h1>
        <p className="mt-1 text-sm text-[#909399]">{config.description}</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#ebeef5] p-4">
          <Input
            placeholder={config.filters[0]?.placeholder ?? "请输入关键字"}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setPage(1);
                void loadRows({ page: 1 });
              }
            }}
          />
          {config.filters
            .filter((filter) => filter.key !== "keyword")
            .map((filter) => (
              <Input
                key={filter.key}
                placeholder={filter.placeholder ?? filter.label}
                type={filter.type === "date" ? "date" : "text"}
                value={filterValues[filter.key] ?? ""}
                onChange={(event) => {
                  setFilterValues((current) => ({ ...current, [filter.key]: event.target.value }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setPage(1);
                    void loadRows({ page: 1 });
                  }
                }}
              />
            ))}
          <Button
            tone="primary"
            onClick={() => {
              setPage(1);
              void loadRows({ page: 1 });
            }}
          >
            <Search size={15} />
            查询
          </Button>
          <Button
            onClick={() => {
              setKeyword("");
              setFilterValues({});
              setPage(1);
              void loadRows({ page: 1, keyword: "", filterValues: {} });
            }}
          >
            重置
          </Button>
          {!hideCreateImportTemplate ? (
            <>
              <Button
                tone="primary"
                onClick={() => {
                  setEditing(null);
                  setInstanceContractDeviceCode("");
                  setBillingContractNo("");
                  setShowForm(true);
                }}
              >
                <Plus size={15} />
                新建
              </Button>
              <Button tone="success" onClick={() => fileRef.current?.click()}>
                <Upload size={15} />
                批量导入
              </Button>
              <a href={`/api/entities/${config.key}/template`}>
                <Button>
                  <FileSpreadsheet size={15} />
                  下载模板
                </Button>
              </a>
            </>
          ) : null}
          <a href={`/api/entities/${config.key}/export?keyword=${encodeURIComponent(keyword)}`}>
            <Button tone="warning">
              <FileDown size={15} />
              导出 Excel
            </Button>
          </a>
          {config.key === "shipments" ? (
            <Button className="ml-auto" onClick={() => setShowFieldSettings(true)}>
              <Columns3 size={15} />
              字段设置
            </Button>
          ) : null}
          {!hideCreateImportTemplate ? (
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
                event.currentTarget.value = "";
              }}
            />
          ) : null}
        </div>

        {hiddenColumns.length ? (
          <div className="border-b border-[#ebeef5] bg-[#fffdf5] px-4 py-2 text-xs text-[#909399]">
            当前隐藏字段：{hiddenColumns.map((field) => field.label).join("、")}
          </div>
        ) : null}

        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                {visibleColumns.map((column) => (
                  <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={column.key}>
                    {column.label}
                  </th>
                ))}
                <th className="sticky right-0 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-3 text-left font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="hover:bg-[#fafafa]" key={String(row[config.primaryKey])}>
                  {visibleColumns.map((column) => (
                    <td className="max-w-[260px] truncate border-b border-r border-[#ebeef5] px-3 py-3" key={column.key}>
                      {formatValue(row[column.key], column.type)}
                    </td>
                  ))}
                  <td className="sticky right-0 whitespace-nowrap border-b border-[#ebeef5] bg-white px-3 py-3">
                    <Button
                      onClick={() => {
                        setEditing(row);
                        setInstanceContractDeviceCode(String(row.deviceCode ?? ""));
                        setBillingContractNo(String(row.instanceContractNo ?? ""));
                        setShowForm(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button className="ml-2" tone="danger" onClick={() => deleteRow(row)}>
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="py-12 text-center text-[#909399]" colSpan={visibleColumns.length + 1}>
                    {loading ? "加载中..." : "暂无数据"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Panel>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <form
            action={saveRow}
            className="max-h-[84vh] w-[820px] overflow-auto bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center">
              <h2 className="text-lg text-[#303133]">{editing ? `编辑${config.title}` : `新建${config.title}`}</h2>
              <button
                className="ml-auto text-xl text-[#909399]"
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setInstanceContractDeviceCode("");
                  setBillingContractNo("");
                }}
              >
                x
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              {config.formFields.map((field) => (
                <label className={field.type === "textarea" ? "col-span-2" : ""} key={field.key}>
                  <span className="mb-1 block text-sm font-medium text-[#606266]">
                    {field.required ? <span className="text-[#f56c6c]">*</span> : null}
                    {field.label}
                  </span>
                  {field.type === "textarea" ? (
                    <Textarea
                      className="w-full"
                      name={field.key}
                      defaultValue={String(editing?.[field.key] ?? "")}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]"
                      defaultValue={String(editing?.[field.key] ?? field.options?.[0]?.value ?? "")}
                      name={field.key}
                      required={field.required}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "boolean" ? (
                    <input name={field.key} type="checkbox" defaultChecked={Boolean(editing?.[field.key])} />
                  ) : config.key === "billing-ledgers" && field.key === "instanceContractNo" ? (
                    <>
                      <Input
                        className="w-full"
                        list="billing-ledger-contract-nos"
                        name={field.key}
                        value={billingContractNo}
                        onChange={(event) => setBillingContractNo(event.target.value)}
                      />
                      {!selectedBillingContract ? (
                        <div className="mt-1 text-xs text-[#f56c6c]">请选择与当前国家和实例编码匹配的实例合同号</div>
                      ) : null}
                    </>
                  ) : (
                    <Input
                      className="w-full"
                      name={field.key}
                      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                      step={field.type === "number" ? "0.0001" : undefined}
                      list={config.key === "instance-contracts" && field.key === "deviceCode" ? "instance-contract-device-codes" : undefined}
                      value={
                        config.key === "instance-contracts" && field.key === "modelCode"
                          ? instanceContractAutofill.modelCode
                          : config.key === "instance-contracts" && field.key === "instanceModelEn"
                            ? instanceContractAutofill.instanceModelEn
                            : config.key === "billing-ledgers" && field.key === "contractCurrency"
                              ? String(selectedBillingContract?.currency ?? "")
                              : config.key === "billing-ledgers" && field.key === "first24MonthPrice"
                                ? String(selectedBillingContract?.first24MonthPriceUSD ?? "")
                                : config.key === "billing-ledgers" && field.key === "next36MonthPrice"
                                  ? String(selectedBillingContract?.next36MonthPriceUSD ?? "")
                          : undefined
                      }
                      defaultValue={
                        (config.key === "instance-contracts" && ["modelCode", "instanceModelEn"].includes(field.key)) ||
                        (config.key === "billing-ledgers" && ["contractCurrency", "first24MonthPrice", "next36MonthPrice"].includes(field.key))
                          ? undefined
                          : field.type === "date"
                            ? formatDateInputValue(editing?.[field.key])
                            : String(editing?.[field.key] ?? "")
                      }
                      required={field.required}
                      readOnly={
                        (config.key === "instance-contracts" && ["modelCode", "instanceModelEn"].includes(field.key)) ||
                        (config.key === "billing-ledgers" && ["ledgerId", "purchaseOrderItemId", "countryCode", "batchName", "requestNo", "poNo", "deviceCode", "modelCode", "nameEn", "quantity", "actualCurrency", "actualUnitPrice", "contractCurrency", "first24MonthPrice", "next36MonthPrice", "status"].includes(field.key))
                      }
                      onChange={
                        config.key === "instance-contracts" && field.key === "deviceCode"
                          ? (event) => setInstanceContractDeviceCode(event.target.value)
                          : undefined
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            {config.key === "instance-contracts" ? (
              <datalist id="instance-contract-device-codes">
                {instanceModels.map((model) => (
                  <option key={String(model.deviceCode)} value={String(model.deviceCode)}>
                    {String(model.modelCode ?? "")} {String(model.nameEn ?? "")}
                  </option>
                ))}
              </datalist>
            ) : null}
            {config.key === "billing-ledgers" ? (
              <datalist id="billing-ledger-contract-nos">
                {instanceContracts
                  .filter(
                    (contract) =>
                      String(contract.countryCode ?? "") === String(editing?.countryCode ?? "") &&
                      String(contract.deviceCode ?? "") === String(editing?.deviceCode ?? ""),
                  )
                  .map((contract) => (
                    <option key={String(contract.id ?? `${contract.contractNo}-${contract.countryCode}-${contract.deviceCode}`)} value={String(contract.contractNo ?? "")}>
                      {String(contract.currency ?? "")} / 24: {String(contract.first24MonthPriceUSD ?? "")} / 36: {String(contract.next36MonthPriceUSD ?? "")}
                    </option>
                  ))}
              </datalist>
            ) : null}
            {config.key === "shipments" ? <ShipmentTimelinePreview /> : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                  setInstanceContractDeviceCode("");
                  setBillingContractNo("");
                }}
              >
                取消
              </Button>
              <Button tone="primary" type="submit">
                确定
              </Button>
            </div>
          </form>
        </div>
      )}

      {showFieldSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45">
          <div className="w-[720px] bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center">
              <div>
                <h2 className="text-lg text-[#303133]">物流字段设置</h2>
                <p className="mt-1 text-sm text-[#909399]">
                  勾选需要在物流列表中显示的字段，隐藏字段仍会在这里集中展示。
                </p>
              </div>
              <button
                className="ml-auto text-xl text-[#909399]"
                type="button"
                onClick={() => setShowFieldSettings(false)}
              >
                x
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-4">
              <FieldSettingsSection
                columns={columnSettingGroups.visible}
                icon="visible"
                title={`已显示字段（${columnSettingGroups.visible.length}）`}
                visibility={visibility}
                onChange={setVisibility}
              />
              <FieldSettingsSection
                columns={columnSettingGroups.hidden}
                icon="hidden"
                title={`隐藏字段（${columnSettingGroups.hidden.length}）`}
                visibility={visibility}
                onChange={setVisibility}
              />
            </div>

            <div className="rounded border border-[#ebeef5] bg-[#fffdf5] px-3 py-2 text-xs leading-6 text-[#909399]">
              当前隐藏字段：
              {hiddenColumns.length ? hiddenColumns.map((field) => field.label).join("、") : "无"}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setVisibility(mergeColumnVisibility(config.listFields, {}))}>
                恢复默认
              </Button>
              <Button tone="primary" onClick={() => setShowFieldSettings(false)}>
                确定
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldSettingsSection({
  columns,
  icon,
  title,
  visibility,
  onChange,
}: {
  columns: Array<{ key: string; label: string; defaultVisible?: boolean }>;
  icon: "visible" | "hidden";
  title: string;
  visibility: ColumnVisibility;
  onChange: React.Dispatch<React.SetStateAction<ColumnVisibility>>;
}) {
  return (
    <div className="min-h-[260px] rounded border border-[#ebeef5]">
      <div className="flex items-center gap-2 border-b border-[#ebeef5] bg-[#f5f7fa] px-3 py-2 font-medium text-[#303133]">
        {icon === "visible" ? <Eye size={15} /> : <EyeOff size={15} />}
        {title}
      </div>
      <div className="grid max-h-[300px] grid-cols-2 gap-2 overflow-auto p-3">
        {columns.map((field) => (
          <label
            className="flex min-h-9 items-center gap-2 rounded border border-[#ebeef5] bg-white px-3 text-sm text-[#606266]"
            key={field.key}
            title={field.label}
          >
            <input
              checked={visibility[field.key] ?? field.defaultVisible !== false}
              type="checkbox"
              onChange={(event) =>
                onChange((current) => ({ ...current, [field.key]: event.target.checked }))
              }
            />
            <span className="truncate">{field.label}</span>
          </label>
        ))}
        {!columns.length ? (
          <div className="col-span-2 py-8 text-center text-sm text-[#909399]">暂无字段</div>
        ) : null}
      </div>
    </div>
  );
}

function ShipmentTimelinePreview() {
  return (
    <div className="mt-6 border-t border-[#ebeef5] pt-4">
      <div className="mb-3 text-sm font-medium text-[#303133]">物流时间线</div>
      <div className="flex flex-wrap gap-2 text-xs text-[#606266]">
        {["CRD", "APD交单", "ASD提货", "起飞/开船", "到港", "清关完成", "派送"].map((item) => (
          <span className="rounded border border-[#dcdfe6] bg-[#f5f7fa] px-3 py-2" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatValue(value: Row[string], type?: string) {
  return formatDisplayValue(value, type);
  if (value === null || value === undefined || value === "") return "-";
  if (type === "boolean") return value ? "是" : "否";
  if (type === "number") return Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
  return String(value);
}

function findBillingContract(contracts: Row[], ledger: Row | null, contractNo: string) {
  const selectedContractNo = contractNo.trim();
  if (!ledger || !selectedContractNo) return null;

  return (
    contracts.find(
      (contract) =>
        String(contract.contractNo ?? "") === selectedContractNo &&
        String(contract.countryCode ?? "") === String(ledger.countryCode ?? "") &&
        String(contract.deviceCode ?? "") === String(ledger.deviceCode ?? ""),
    ) ?? null
  );
}
