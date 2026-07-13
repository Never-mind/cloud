"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import { formatNumericInputValue, parseNumericInputValue } from "@/lib/numeric-input";
import { PURCHASE_CURRENCY_OPTIONS, buildPurchaseOrderItemRows, type PurchaseDetailDraft } from "@/lib/purchase-order-form";
import { calculatePurchaseTotalAmount } from "@/lib/purchase-lines";
import { buildAutoPurchaseOrderId, buildAutoPurchaseOrderNo, normalizeRequestNos } from "@/lib/procurement-workflow";
import { Button, Input, Panel } from "./ui";

type Row = Record<string, string | number | boolean | null>;

type MasterDraft = {
  purchaseOrderId: string;
  poNo: string;
  requestNo: string;
  sourceRequestNos: string;
  status: string;
  currency: string;
  releasedAt: string;
};

const emptyMaster: MasterDraft = {
  purchaseOrderId: "",
  poNo: "",
  requestNo: "",
  sourceRequestNos: "",
  status: "草稿",
  currency: "USD",
  releasedAt: "",
};

const emptyDetail: PurchaseDetailDraft = {
  requestItemId: "",
  unitPrice: 0,
  hardwareCoefficient: 1,
  softwareCoefficient: 0,
};

export function PurchaseOrderFormPage() {
  const router = useRouter();
  const [master, setMaster] = useState<MasterDraft>(emptyMaster);
  const [details, setDetails] = useState<PurchaseDetailDraft[]>([{ ...emptyDetail }]);
  const [requestItems, setRequestItems] = useState<Row[]>([]);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  async function fetchEntity(entity: string) {
    const response = await fetch(`/api/entities/${entity}?page=1&pageSize=100`);
    const data = await response.json();
    return (data.rows ?? []) as Row[];
  }

  useEffect(() => {
    setMaster((current) => (current.purchaseOrderId ? current : { ...current, purchaseOrderId: buildAutoPurchaseOrderId() }));
    void Promise.all([fetchEntity("request-items"), fetchEntity("instance-models"), fetchEntity("requests")]).then(
      ([itemRows, modelRows, requestRows]) => {
        setRequestItems(itemRows);
        setInstanceModels(modelRows);
        setRequests(requestRows);
      },
    );
  }, []);

  const visibleRequestItems = useMemo(() => {
    if (!master.requestNo) return requestItems;
    return requestItems.filter((item) => String(item.requestNo) === master.requestNo);
  }, [master.requestNo, requestItems]);
  const selectedSourceRequestNos = useMemo(
    () =>
      normalizeRequestNos(
        details
          .map((detail) => String(getRequestItem(detail.requestItemId)?.requestNo ?? detail.requestNo ?? ""))
          .filter(Boolean),
      ),
    [details, requestItems],
  );
  const purchaseTotalAmount = useMemo(
    () =>
      calculatePurchaseTotalAmount(
        details.map((detail) => ({
          quantity: Number(getRequestItem(detail.requestItemId)?.quantity ?? 0),
          unitPrice: detail.unitPrice,
        })),
      ),
    [details, requestItems],
  );

  function updateMaster(key: keyof MasterDraft, value: string) {
    setMaster((current) => ({ ...current, [key]: value }));
  }

  function updateDetail(index: number, patch: Partial<PurchaseDetailDraft>) {
    setDetails((current) =>
      current.map((detail, detailIndex) =>
        detailIndex === index ? { ...detail, ...patch } : detail,
      ),
    );
  }

  function getRequestItem(requestItemId: string) {
    return requestItems.find((item) => String(item.id) === requestItemId);
  }

  function getModel(deviceCode: string) {
    return instanceModels.find((model) => String(model.deviceCode) === deviceCode);
  }

  function generatePoNo() {
    const source = selectedSourceRequestNos || master.requestNo || master.purchaseOrderId;
    updateMaster("poNo", buildAutoPurchaseOrderNo(source));
  }

  async function saveOrder() {
    const sourceRequestNos = selectedSourceRequestNos || master.requestNo;
    const masterPayload = {
      ...master,
      requestNo: sourceRequestNos,
      sourceRequestNos,
    };
    setSaving(true);
    await fetch("/api/entities/purchase-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(masterPayload),
    });

    const itemRows = buildPurchaseOrderItemRows({
      purchaseOrderId: master.purchaseOrderId,
      poNo: master.poNo,
      details: details
        .filter((detail) => detail.requestItemId)
        .map((detail) => ({
          ...detail,
          requestNo: String(getRequestItem(detail.requestItemId)?.requestNo ?? detail.requestNo ?? ""),
        })),
    });

    for (const item of itemRows) {
      await fetch("/api/entities/purchase-order-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
    }

    setSaving(false);
    router.push(`/purchase/orders/${encodeURIComponent(master.purchaseOrderId)}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Button type="button" onClick={() => router.push("/purchase/orders")}>
          <ArrowLeft size={15} />
          杩斿洖鍒楄〃
        </Button>
        <div>
          <h1 className="text-xl font-medium text-[#303133]">鏂板缓閲囪喘鏄庣粏娓呭崟</h1>
          <p className="mt-1 text-sm text-[#909399]">
            鍏堝～鍐欓噰璐富鍗曪紝鍐嶉€夋嫨闇€姹傛槑缁嗙敓鎴愰噰璐槑缁嗭紱淇濆瓨鍚庤繘鍏ラ噰璐竻鍗曟槑缁嗛〉闈㈢户缁慨鏀规垨纭銆?          </p>
        </div>
        <Button className="ml-auto" disabled={saving || !master.poNo || !master.purchaseOrderId} tone="primary" onClick={() => void saveOrder()}>
          <Save size={15} />
          淇濆瓨
        </Button>
      </div>

      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">涓诲崟淇℃伅</div>
        <div className="grid grid-cols-3 gap-4 p-4">
          <Info label="系统采购ID" value={master.purchaseOrderId} />
          <label>
            <span className="mb-1 block text-sm font-medium text-[#606266]">
              <span className="text-[#f56c6c]">*</span>
              PO订单号
            </span>
            <div className="flex gap-2">
              <Input className="w-full" required value={master.poNo} onChange={(event) => updateMaster("poNo", event.target.value)} />
              <Button type="button" onClick={generatePoNo}>自动生成</Button>
            </div>
          </label>
          <label>
            <span className="mb-1 block text-sm font-medium text-[#606266]">鏉ユ簮闇€姹傚崟</span>
            <select
              className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]"
              value={master.requestNo}
              onChange={(event) => updateMaster("requestNo", event.target.value)}
            >
              <option value="">全部需求明细</option>
              {requests.map((request) => (
                <option key={String(request.requestNo)} value={String(request.requestNo)}>
                  {String(request.requestNo)} - {String(request.batchName ?? "")}
                </option>
              ))}
            </select>
          </label>
          <Field label="采购状态" value={master.status} onChange={(value) => updateMaster("status", value)} />
          <label>
            <span className="mb-1 block text-sm font-medium text-[#606266]">
              <span className="text-[#f56c6c]">*</span>
              甯佺
            </span>
            <select
              className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]"
              required
              value={master.currency}
              onChange={(event) => updateMaster("currency", event.target.value)}
            >
              {PURCHASE_CURRENCY_OPTIONS.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <Field label="涓嬪彂鏃ユ湡" type="date" value={master.releasedAt} onChange={(value) => updateMaster("releasedAt", value)} />
          <Info label="采购总金额" value={purchaseTotalAmount} />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center gap-2 border-b border-[#ebeef5] px-4 py-3">
          <div className="font-medium text-[#303133]">閲囪喘鏄庣粏</div>
          <Button className="ml-auto" onClick={() => setDetails((current) => [...current, { ...emptyDetail }])}>
            <Plus size={15} />
            鏂板鏄庣粏
          </Button>
        </div>
        <div className="table-scroll overflow-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">需求明细</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">设备编码</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">机型</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">英文名称</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">数量</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">单价</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">采购金额</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">硬件系数</th>
                <th className="border-b border-r border-[#ebeef5] px-3 py-3 text-left">软件系数</th>
              </tr>
            </thead>
            <tbody>
              {details.map((detail, index) => {
                const requestItem = getRequestItem(detail.requestItemId);
                const model = getModel(String(requestItem?.deviceCode ?? ""));

                return (
                  <tr key={index}>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <select
                        className="h-9 min-w-[220px] rounded border border-[#dcdfe6] bg-white px-2"
                        value={detail.requestItemId}
                        onChange={(event) => updateDetail(index, { requestItemId: event.target.value })}
                      >
                        <option value="">璇烽€夋嫨</option>
                        {visibleRequestItems.map((item) => (
                          <option key={String(item.id)} value={String(item.id)}>
                            {String(item.id)} - {String(item.deviceCode)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(requestItem?.deviceCode)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(model?.modelCode)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(model?.nameEn)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">{formatValue(requestItem?.quantity)}</td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <NumberInput value={detail.unitPrice} onChange={(value) => updateDetail(index, { unitPrice: value })} />
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      {formatValue(Number(requestItem?.quantity ?? 0) * Number(detail.unitPrice ?? 0))}
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <NumberInput value={detail.hardwareCoefficient} onChange={(value) => updateDetail(index, { hardwareCoefficient: value })} />
                    </td>
                    <td className="border-b border-r border-[#ebeef5] px-3 py-3">
                      <NumberInput value={detail.softwareCoefficient} onChange={(value) => updateDetail(index, { softwareCoefficient: value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Field({
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium text-[#606266]">
        {required ? <span className="text-[#f56c6c]">*</span> : null}
        {label}
      </span>
      <Input
        className="w-full"
        required={required}
        step={type === "number" ? "0.0001" : undefined}
        type={type}
        value={type === "date" ? formatDateInputValue(value) : value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="border border-[#ebeef5] bg-[#fafafa] p-3">
      <div className="text-xs text-[#909399]">{label}</div>
      <div className="mt-1 truncate text-sm text-[#303133]">{formatValue(value)}</div>
    </div>
  );
}

function NumberInput({ onChange, value }: { onChange: (value: number) => void; value: number }) {
  return (
    <Input
      className="w-28 min-w-0"
      step="0.0001"
      type="number"
      value={formatNumericInputValue(value)}
      onChange={(event) => onChange(parseNumericInputValue(event.target.value))}
    />
  );
}

function formatValue(value: unknown) {
  return formatDisplayValue(value as string | number | boolean | null | undefined);
}
