"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Pencil, Plus, Save, Upload, X } from "lucide-react";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { formatNumericInputValue, parseNumericInputValue } from "@/lib/numeric-input";
import { isConfirmedOrderStatus } from "@/lib/order-status";
import { buildRequestItemRows, type RequestDetailDraft } from "@/lib/request-order-form";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

type MasterDraft = {
  requestNo: string;
  countryCode: string;
  contractNo: string;
  batchName: string;
  requestType: string;
  status: string;
  plannedDeliveryDate: string;
};

type DetailDraft = RequestDetailDraft;
type SaveMode = "draft" | "confirm";

const emptyMaster: MasterDraft = {
  requestNo: "",
  countryCode: "",
  contractNo: "",
  batchName: "",
  requestType: "整机",
  status: "草稿",
  plannedDeliveryDate: "",
};

const emptyDetail: DetailDraft = {
  deviceCode: "",
  supplierId: "",
  quantity: 0,
};

export function RequestOrderFormPage({ requestNo }: { requestNo?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [master, setMaster] = useState<MasterDraft>(emptyMaster);
  const [details, setDetails] = useState<DetailDraft[]>([{ ...emptyDetail }]);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [countries, setCountries] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(!requestNo);
  const canEdit = !requestNo || editing;
  const canConfirm = !isConfirmedRequestStatus(master.status);

  async function fetchEntity(entity: string) {
    const response = await fetch(`/api/entities/${entity}?page=1&pageSize=100`);
    const data = await response.json();
    return (data.rows ?? []) as Row[];
  }

  useEffect(() => {
    void Promise.all([
      fetchEntity("instance-models"),
      fetchEntity("suppliers"),
      fetchEntity("countries"),
    ]).then(([models, supplierRows, countryRows]) => {
      setInstanceModels(models);
      setSuppliers(supplierRows);
      setCountries(countryRows);
    });
  }, []);

  useEffect(() => {
    if (!requestNo) return;

    void Promise.all([
      fetch(`/api/entities/requests/${encodeURIComponent(requestNo)}`),
      fetchEntity("request-items"),
    ]).then(async ([masterResponse, itemRows]) => {
      if (masterResponse.ok) {
        const row = await masterResponse.json();
        setMaster({
          requestNo: String(row.requestNo ?? ""),
          countryCode: String(row.countryCode ?? ""),
          contractNo: String(row.contractNo ?? ""),
          batchName: String(row.batchName ?? ""),
          requestType: String(row.requestType ?? "整机"),
          status: String(row.status ?? "草稿"),
          plannedDeliveryDate: formatDateInputValue(row.plannedDeliveryDate),
        });
        setEditing(false);
      }

      const existingDetails = itemRows
        .filter((item) => String(item.requestNo) === requestNo)
        .map((item) => ({
          deviceCode: String(item.deviceCode ?? ""),
          supplierId: String(item.supplierId ?? ""),
          quantity: Number(item.quantity ?? 0),
        }));

      setDetails(existingDetails.length ? existingDetails : [{ ...emptyDetail }]);
    });
  }, [requestNo]);

  function updateMaster(key: keyof MasterDraft, value: string) {
    if (!canEdit) return;
    setMaster((current) => ({ ...current, [key]: value }));
  }

  function updateDetail(index: number, patch: Partial<DetailDraft>) {
    if (!canEdit) return;
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, ...patch } : detail,
      ),
    );
  }

  function getModel(deviceCode: string) {
    return instanceModels.find((model) => String(model.deviceCode) === deviceCode);
  }

  async function importDetails(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const imported = rows
      .map((row) => ({
        deviceCode: String(row.deviceCode ?? row["设备编码"] ?? ""),
        supplierId: String(row.supplierId ?? row["供应商"] ?? row["供应商ID"] ?? ""),
        quantity: Number(row.quantity ?? row["节点数量"] ?? 0),
      }))
      .filter((row) => row.deviceCode || row.supplierId || row.quantity);

    if (imported.length) setDetails(imported);
  }

  async function upsertRequestItems() {
    const requestItems = buildRequestItemRows({
      requestNo: master.requestNo,
      requestedAt: master.plannedDeliveryDate || formatDateInputValue(new Date()),
      details: details.filter((detail) => detail.deviceCode && detail.supplierId),
    });

    for (const item of requestItems) {
      const existingResponse = await fetch(`/api/entities/request-items/${encodeURIComponent(item.id)}`);
      await fetch(
        `/api/entities/request-items${existingResponse.ok ? `/${encodeURIComponent(item.id)}` : ""}`,
        {
          method: existingResponse.ok ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        },
      );
    }
  }

  async function saveOrder(mode: SaveMode) {
    setSaving(true);
    if (mode === "confirm") setConfirming(true);
    const status = mode === "confirm" ? "待下单" : "草稿";
    const body = { ...master, status };

    const existingResponse = await fetch(`/api/entities/requests/${encodeURIComponent(master.requestNo)}`);
    const saveResponse = await fetch(`/api/entities/requests${existingResponse.ok ? `/${encodeURIComponent(master.requestNo)}` : ""}`, {
      method: existingResponse.ok ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!saveResponse.ok) {
      const data = await saveResponse.json().catch(() => ({}));
      setSaving(false);
      setConfirming(false);
      alert(data.error ?? "保存失败");
      return;
    }

    await upsertRequestItems();

    if (mode === "confirm") {
      const response = await fetch("/api/procurement/from-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestNo: master.requestNo }),
      });
      const data = await response.json().catch(() => ({}));
      setSaving(false);
      if (!response.ok) {
        setConfirming(false);
        alert(data.error ?? "确认失败");
        return;
      }
      setMaster((current) => ({ ...current, status }));
      setEditing(false);
      router.replace(`/requests/orders/${encodeURIComponent(master.requestNo)}`);
      return;
    }

    setSaving(false);
    setMaster((current) => ({ ...current, status }));
    setEditing(false);
    router.replace(`/requests/orders/${encodeURIComponent(master.requestNo)}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button type="button" onClick={() => router.push("/requests/orders")}>
          <ArrowLeft size={15} />
          返回列表
        </Button>
        <div>
          <h1 className="text-xl font-medium text-[#303133]">
            {requestNo ? "修改需求单明细表" : "新建需求单明细表"}
          </h1>
          <p className="mt-1 text-sm text-[#909399]">
            保存后需求单为草稿；确认后需求单状态为待下单，并自动生成一张采购草稿。
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {canEdit ? (
            <>
              {requestNo ? (
                <Button disabled={saving} onClick={() => setEditing(false)}>
                  <X size={15} />
                  取消
                </Button>
              ) : null}
              <Button disabled={saving || !master.requestNo} tone="primary" onClick={() => void saveOrder("draft")}>
                <Save size={15} />
                {requestNo ? "保存" : "保存草稿"}
              </Button>
              {!requestNo ? (
                <Button disabled={saving || !master.requestNo} tone="success" onClick={() => void saveOrder("confirm")}>
                  <CheckCircle2 size={15} />
                  {confirming ? "已确认" : "确认需求单"}
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button disabled={saving || !canConfirm} onClick={() => setEditing(true)}>
                <Pencil size={15} />
                修改
              </Button>
              <Button disabled={saving || !master.requestNo || !canConfirm} tone="success" onClick={() => void saveOrder("confirm")}>
                <CheckCircle2 size={15} />
                {!canConfirm || confirming ? "已确认" : "确认需求单"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">主单信息</div>
        <div className="grid grid-cols-3 gap-4 p-4">
          <Field disabled={!canEdit || Boolean(requestNo)} label="需求单号" required value={master.requestNo} onChange={(value) => updateMaster("requestNo", value)} />
          <label>
            <span className="mb-1 block text-sm font-medium text-[#606266]">
              <span className="text-[#f56c6c]">*</span>
              国家
            </span>
            <select
              className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]"
              required
              disabled={!canEdit}
              value={master.countryCode}
              onChange={(event) => updateMaster("countryCode", event.target.value)}
            >
              <option value="">请选择</option>
              {countries.map((country) => (
                <option key={String(country.code)} value={String(country.code)}>
                  {String(country.code)} - {String(country.nameZh ?? country.nameEn ?? "")}
                </option>
              ))}
            </select>
          </label>
          <Field disabled={!canEdit} label="合同号" required value={master.contractNo} onChange={(value) => updateMaster("contractNo", value)} />
          <Field disabled={!canEdit} label="批次名称" required value={master.batchName} onChange={(value) => updateMaster("batchName", value)} />
          <Field disabled={!canEdit} label="类型" value={master.requestType} onChange={(value) => updateMaster("requestType", value)} />
          <Field disabled={!canEdit} label="计划交付日期" type="date" value={master.plannedDeliveryDate} onChange={(value) => updateMaster("plannedDeliveryDate", value)} />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2 border-b border-[#ebeef5] px-4 py-3">
          <div className="font-medium text-[#303133]">需求明细</div>
          <Button className="ml-auto" disabled={!canEdit} onClick={() => setDetails((current) => [...current, { ...emptyDetail }])}>
            <Plus size={15} />
            新增明细
          </Button>
          <Button disabled={!canEdit} tone="success" onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            导入明细
          </Button>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importDetails(file);
            }}
          />
        </div>

        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">设备编码</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">机型</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">英文名称</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">供应商</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">节点数量</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, index) => {
                const model = getModel(detail.deviceCode);
                return (
                  <tr key={index}>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <Input
                        className="h-9 min-w-[180px] rounded border border-[#dcdfe6] bg-white px-2"
                        list="request-device-codes"
                        value={detail.deviceCode}
                        disabled={!canEdit}
                        onChange={(event) => updateDetail(index, { deviceCode: event.target.value })}
                      />
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(model?.modelCode)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(model?.nameEn)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <select
                        className="h-9 min-w-[160px] rounded border border-[#dcdfe6] bg-white px-2"
                        value={detail.supplierId}
                        disabled={!canEdit}
                        onChange={(event) => updateDetail(index, { supplierId: event.target.value })}
                      >
                        <option value="">请选择</option>
                        {suppliers.map((supplier) => (
                          <option key={String(supplier.supplierId)} value={String(supplier.supplierId)}>
                            {String(supplier.name ?? supplier.supplierId)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <Input
                        className="w-28 min-w-0"
                        min={0}
                        disabled={!canEdit}
                        type="number"
                        value={formatNumericInputValue(detail.quantity)}
                        onChange={(event) => updateDetail(index, { quantity: parseNumericInputValue(event.target.value) })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="request-device-codes">
            {instanceModels.map((item) => (
              <option key={String(item.deviceCode)} value={String(item.deviceCode)}>
                {String(item.deviceCode)}
              </option>
            ))}
          </datalist>
        </div>
      </Panel>
    </div>
  );
}

function Field({
  disabled,
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "date" | "text";
  value: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-[#606266]">
        {required ? <span className="text-[#f56c6c]">*</span> : null}
        {label}
      </span>
      <Input className="w-full" disabled={disabled} required={required} type={type} value={type === "date" ? formatDateInputValue(value) : value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function formatValue(value: unknown) {
  return formatDisplayValue(value as string | number | boolean | null | undefined);
}

function isConfirmedRequestStatus(status: string) {
  return isConfirmedOrderStatus("requests", status);
}
