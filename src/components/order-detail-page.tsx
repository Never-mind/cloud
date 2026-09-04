"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Calculator, CheckCircle2, Pencil, Save, X } from "lucide-react";
import { formatDateInputValue, formatDisplayValue } from "@/lib/display-format";
import type { EntityConfig } from "@/lib/modules";
import { formatNumericInputValue, parseNumericInputValue } from "@/lib/numeric-input";
import { getPurchaseOrderForDetailLines } from "@/lib/order-detail-view";
import type { OrderRouteMode } from "@/lib/order-routes";
import { buildPurchaseProductLines, calculatePurchaseTotalAmount } from "@/lib/purchase-lines";
import { refreshPowerPricingSnapshot, serializePowerPricingSnapshot, type PowerPriceContext, type PowerPricingSnapshot } from "@/lib/power-price-calculator";
import { PurchaseOrderDemandPlanTabs } from "./purchase-order-demand-plan-tabs";
import { getReturnTo } from "@/lib/client-list-navigation";
import { readJsonResponse } from "@/lib/client-response";
import { AuditInfoBar, Button, Input, Panel } from "./ui";
import { StickyTable } from "./sticky-table";
import { PowerPriceCalculationDrawer } from "./power-price-calculation-drawer";

type Row = Record<string, string | number | boolean | null>;

const hiddenPurchaseMasterFieldKeys = new Set(["purchaseOrderId", "sourceRequestNos"]);

export function OrderDetailPage({
  id,
  mode,
  masterConfig,
  detailConfig,
  relationKey,
}: {
  id: string;
  mode: OrderRouteMode;
  masterConfig: EntityConfig;
  detailConfig: EntityConfig;
  relationKey: string;
}) {
  const searchParams = useSearchParams();
  const returnTo = getReturnTo(searchParams.get("returnTo"), mode === "requests" ? "/requests/orders" : "/purchase/orders");
  const [master, setMaster] = useState<Row | null>(null);
  const [details, setDetails] = useState<Row[]>([]);
  const [requestItems, setRequestItems] = useState<Row[]>([]);
  const [instanceModels, setInstanceModels] = useState<Row[]>([]);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [masterDraft, setMasterDraft] = useState<Row>({});
  const [detailDrafts, setDetailDrafts] = useState<Row[]>([]);
  const [pricingDetailId, setPricingDetailId] = useState<string | null>(null);

  async function loadData() {
    const detailType = mode === "purchase" ? "purchase-orders" : "requests";
    const response = await fetch(`/api/order-details/${detailType}/${encodeURIComponent(id)}`);
    if (!response.ok) {
      setMaster(null);
      setDetails([]);
      setRequestItems([]);
      setInstanceModels([]);
      return;
    }

    const data = await readJsonResponse<OrderDetailResponse>(response, "采购订单详情加载失败");
    const nextMaster = (data.master ?? null) as Row | null;
    const nextDetails = (data.details ?? []) as Row[];
    setMaster(nextMaster);
    setDetails(nextDetails);
    setRequestItems((data.requestItems ?? []) as Row[]);
    setInstanceModels((data.instanceModels ?? []) as Row[]);
    setMasterDraft(nextMaster ?? {});
    setDetailDrafts(nextDetails);
  }

  useEffect(() => {
    void loadData();
  }, [id, mode]);

  const totalQuantity = useMemo(() => {
    if (mode === "requests") {
      return details.reduce((total, detail) => total + Number(detail.quantity ?? 0), 0);
    }

    const itemIds = new Set(details.map((detail) => String(detail.requestItemId)));
    return requestItems
      .filter((item) => itemIds.has(String(item.id)))
      .reduce((total, item) => total + Number(item.quantity ?? 0), 0);
  }, [details, mode, requestItems]);

  const purchaseProductLines = useMemo(() => {
    if (!master || mode !== "purchase") return [];
    const activeMaster = getPurchaseOrderForDetailLines(master, masterDraft, editing);
    return buildPurchaseProductLines({
      purchaseOrders: [activeMaster] as any,
      purchaseItems: (editing ? detailDrafts : details) as any,
      requestItems: requestItems as any,
      instanceModels: instanceModels as any,
    });
  }, [detailDrafts, details, editing, instanceModels, master, masterDraft, mode, requestItems]);
  const purchaseTotalAmount = useMemo(
    () => calculatePurchaseTotalAmount(purchaseProductLines),
    [purchaseProductLines],
  );
  const masterFormFields = useMemo(
    () =>
      mode === "purchase"
        ? masterConfig.formFields.filter((field) => !hiddenPurchaseMasterFieldKeys.has(field.key))
        : masterConfig.formFields,
    [masterConfig.formFields, mode],
  );
  const masterListFields = useMemo(
    () =>
      mode === "purchase"
        ? masterConfig.listFields.filter((field) => !hiddenPurchaseMasterFieldKeys.has(field.key))
        : masterConfig.listFields,
    [masterConfig.listFields, mode],
  );

  const detailColumns =
    mode === "purchase"
      ? [
          { key: "deviceCode", label: "产品实例编码" },
          { key: "nameZh", label: "中文名称" },
          { key: "nameEn", label: "英文名称" },
          { key: "quantity", label: "数量", type: "number" },
          { key: "currency", label: "币种" },
          { key: "taxExcludedUnitPrice", label: "不含税单价", type: "money" },
          { key: "taxSurcharge", label: "税费加成", type: "money" },
          { key: "unitPrice", label: "含税单价", type: "money" },
          { key: "totalAmount", label: "含税总价", type: "money" },
          { key: "capexUnitPrice", label: "采购CAPEX单价", type: "money" },
          { key: "opexUnitPrice", label: "采购OPEX单价", type: "money" },
          { key: "powerFirst24VatIncluded", label: "算力服务价格（1-24个月，含VAT）", type: "money" },
          { key: "powerNext36VatIncluded", label: "算力服务价格（后36个月，含VAT）", type: "money" },
          { key: "powerPricing", label: "测算" },
          { key: "hardwareCoefficient", label: "硬件系数", type: "number" },
          { key: "softwareCoefficient", label: "软件系数", type: "number" },
          { key: "totalCoefficient", label: "总系数", type: "number" },
          { key: "requestItemId", label: "需求明细ID" },
        ]
      : detailConfig.listFields;
  const detailRows: Row[] = (mode === "purchase" ? purchaseProductLines : details) as Row[];

  async function confirmPurchaseOrder() {
    setConfirming(true);
    const response = await fetch(`/api/procurement/${encodeURIComponent(id)}/confirm`, {
      method: "POST",
    });
    if (!response.ok) {
      setConfirming(false);
      return;
    }
    await loadData();
  }

  function startEditing() {
    setMasterDraft(master ?? {});
    setDetailDrafts(details);
    setEditing(true);
  }

  function cancelEditing() {
    setMasterDraft(master ?? {});
    setDetailDrafts(details);
    setEditing(false);
  }

  function updateMasterDraft(key: string, value: string | number | null) {
    setMasterDraft((current) => {
      const next = { ...current, [key]: value };
      if (mode === "purchase" && (key === "currency" || key === "usdRate")) {
        setDetailDrafts((currentDetails) => currentDetails.map((detail) => refreshDetailPricing(detail, next)));
      }
      return next;
    });
  }

  function updateDetailDraft(rowId: string, key: string, value: number) {
    setDetailDrafts((current) =>
      current.map((row) => {
        if (String(row.id) !== rowId) return row;
        const next = { ...row, [key]: value };
        if (key === "hardwareCoefficient" || key === "softwareCoefficient") {
          next.totalCoefficient =
            Number(next.hardwareCoefficient ?? 0) + Number(next.softwareCoefficient ?? 0);
        }
        if (key === "taxExcludedUnitPrice" || key === "taxSurcharge") {
          next.unitPrice = Number(next.taxExcludedUnitPrice ?? 0) + Number(next.taxSurcharge ?? 0);
          return refreshDetailPricing(next, masterDraft);
        }
        return next;
      }),
    );
  }

  function getPricingContext(detail: Row, sourceMaster = masterDraft): PowerPriceContext | null {
    const requestItem = requestItems.find((item) => String(item.id) === String(detail.requestItemId ?? ""));
    const deviceCode = String(requestItem?.deviceCode ?? "");
    const countryCode = String(requestItem?.countryCode ?? master?.countryCode ?? "");
    if (!deviceCode || !countryCode.trim()) return null;
    const instanceModel = instanceModels.find((item) => String(item.deviceCode) === deviceCode);
    return {
      countryCode,
      deviceCode,
      b6Type: String(instanceModel?.b6Type ?? ""),
      purchaseCurrency: String(sourceMaster.currency ?? master?.currency ?? ""),
      taxExcludedUnitPrice: Number(detail.taxExcludedUnitPrice ?? 0),
      taxSurcharge: Number(detail.taxSurcharge ?? 0),
      exchangeRate: Number(sourceMaster.usdRate ?? master?.usdRate ?? 0),
    };
  }

  function refreshDetailPricing(detail: Row, sourceMaster = masterDraft): Row {
    if (!detail.powerPricingJson) return detail;
    const context = getPricingContext(detail, sourceMaster);
    if (!context) return detail;
    return applyPricingSnapshot(detail, refreshPowerPricingSnapshot(context, detail.powerPricingJson));
  }

  function applyPricingSnapshot(detail: Row, snapshot: PowerPricingSnapshot): Row {
    return {
      ...detail,
      powerPricingJson: serializePowerPricingSnapshot(snapshot),
      powerFirst24VatIncluded: snapshot.result.first24VatIncluded,
      powerNext36VatIncluded: snapshot.result.next36VatIncluded,
      powerFirst24Manual: snapshot.manualPrices.first24VatIncluded !== undefined,
      powerNext36Manual: snapshot.manualPrices.next36VatIncluded !== undefined,
    };
  }

  async function saveChanges() {
    if (!master) return;
    await fetch(`/api/entities/${masterConfig.key}/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(masterDraft),
    });

    if (mode === "purchase") {
      for (const detail of detailDrafts) {
        const detailPayload =
          masterDraft.poNo && String(detail.poNo ?? "") !== String(masterDraft.poNo)
            ? { ...detail, poNo: masterDraft.poNo }
            : detail;
        await fetch(`/api/entities/${detailConfig.key}/${encodeURIComponent(String(detail.id))}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(detailPayload),
        });
      }
    }

    setEditing(false);
    await loadData();
  }

  if (!master) {
    return (
      <Panel className="p-8 text-center text-[#909399]">
        未找到单据：{id}
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Link href={returnTo}>
          <Button>
            <ArrowLeft size={15} />
            返回列表
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-medium text-[#303133]">
            {mode === "requests" ? "需求单明细" : "采购清单明细"}：{mode === "purchase" ? String(master.poNo ?? id) : id}
          </h1>
          <p className="mt-1 text-sm text-[#909399]">
            {mode === "requests"
              ? "查看当前需求单的主单信息和需求明细。"
              : "查看当前采购清单的主单信息和采购明细，可修改草稿信息，确认后生成物流单据。"}
          </p>
        </div>
        {mode === "purchase" ? (
          <div className="ml-auto flex gap-2">
            {editing ? (
              <>
                <Button onClick={cancelEditing}>
                  <X size={15} />
                  取消
                </Button>
                <Button tone="primary" onClick={() => void saveChanges()}>
                  <Save size={15} />
                  保存
                </Button>
              </>
            ) : (
              <>
                <Button onClick={startEditing}>
                  <Pencil size={15} />
                  修改
                </Button>
                <Button
                  disabled={String(master.status ?? "") === "已确认" || confirming}
                  tone="success"
                  onClick={() => void confirmPurchaseOrder()}
                >
                  <CheckCircle2 size={15} />
                  {String(master.status ?? "") === "已确认" || confirming ? "已确认" : "确认采购"}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">主单信息</div>
        {editing && mode === "purchase" ? (
          <div className="grid grid-cols-4 gap-3 p-4">
            {masterFormFields.map((field) => (
              <label key={field.key}>
                <span className="mb-1 block text-xs text-[#909399]">{field.label}</span>
                {field.type === "select" ? (
                  <select
                    className="h-9 w-full min-w-0 rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]"
                    disabled={field.key === masterConfig.primaryKey}
                    value={String(masterDraft[field.key] ?? field.options?.[0]?.value ?? "")}
                    onChange={(event) => updateMasterDraft(field.key, event.target.value)}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="w-full min-w-0"
                    disabled={field.key === masterConfig.primaryKey}
                    step={field.type === "number" ? "0.0001" : undefined}
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={field.type === "date" ? formatDateInputValue(masterDraft[field.key]) : String(masterDraft[field.key] ?? "")}
                    onChange={(event) =>
                      updateMasterDraft(
                        field.key,
                        field.type === "number" ? Number(event.target.value) : event.target.value,
                      )
                    }
                  />
                )}
              </label>
            ))}
            <label>
              <span className="mb-1 block text-xs text-[#909399]">整机价转合同汇率（CNY → USD）</span>
              <Input className="w-full min-w-0" step="0.000001" type="number" value={formatNumericInputValue(Number(masterDraft.usdRate ?? 0))} onChange={(event) => updateMasterDraft("usdRate", parseNumericInputValue(event.target.value))} />
            </label>
            <Info label="总数量" value={totalQuantity} />
            {mode === "purchase" ? <Info label="采购总金额" value={purchaseTotalAmount} type="money" /> : null}
            <Info label="明细数量" value={details.length} />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 p-4">
            {masterListFields.map((field) => (
              <Info key={field.key} label={field.label} value={master[field.key]} />
            ))}
            <Info label="整机价转合同汇率（CNY → USD）" value={master.usdRate} type="number" />
            <Info label="总数量" value={totalQuantity} />
            {mode === "purchase" ? <Info label="采购总金额" value={purchaseTotalAmount} type="money" /> : null}
            <Info label="明细数量" value={details.length} />
          </div>
        )}
      </Panel>

      <Panel>
        <div className="border-b border-[#ebeef5] px-4 py-3 font-medium text-[#303133]">明细列表</div>
        <StickyTable className="table-scroll overflow-auto" tableKey={`order-detail-${mode}`}>
          <table className={mode === "purchase" ? "min-w-[2200px] whitespace-nowrap border-collapse text-sm" : "min-w-[1050px] whitespace-nowrap border-collapse text-sm"}>
            <thead className="bg-[#f5f7fa] text-[#303133]">
              <tr>
                {detailColumns.map((field) => (
                  <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={field.key}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detailRows.map((row) => (
                <tr className="hover:bg-[#fafafa]" key={String(row.id ?? row[detailConfig.primaryKey])}>
                  {detailColumns.map((field) => (
                    <td className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3" key={field.key}>
                      {field.key === "powerPricing" && mode === "purchase" ? (
                        editing ? <button className="inline-flex h-8 w-8 items-center justify-center border border-[#b3d8ff] text-[#1890ff] hover:bg-[#ecf5ff] disabled:cursor-not-allowed disabled:border-[#ebeef5] disabled:text-[#c0c4cc]" disabled={!getPricingContext(detailDrafts.find((item) => String(item.id) === String(row.id)) ?? row)} title="算力服务费测算" type="button" onClick={() => setPricingDetailId(String(row.id))}><Calculator size={15} /></button> : "-"
                      ) : field.key === "powerFirst24VatIncluded" || field.key === "powerNext36VatIncluded" ? (
                        row.powerPricingJson ? `USD ${formatPowerPrice(row[field.key])}` : "-"
                      ) : editing && mode === "purchase" && ["taxExcludedUnitPrice", "taxSurcharge", "capexUnitPrice", "opexUnitPrice", "hardwareCoefficient", "softwareCoefficient"].includes(field.key) ? (
                        <NumberInput
                          value={Number(row[field.key] ?? 0)}
                          onChange={(value) => updateDetailDraft(String(row.id), field.key, value)}
                        />
                      ) : (
                        formatValue(getDetailDisplayValue(row, field.key), field.type)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {!details.length ? (
                <tr>
                  <td className="py-10 text-center text-[#909399]" colSpan={detailColumns.length}>
                    暂无明细
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </StickyTable>
      </Panel>
      {pricingDetailId ? (() => {
        const detail = detailDrafts.find((item) => String(item.id) === pricingDetailId);
        const context = detail ? getPricingContext(detail) : null;
        return detail && context ? <PowerPriceCalculationDrawer context={context} existingSnapshot={detail.powerPricingJson} onClose={() => setPricingDetailId(null)} onApply={(snapshot) => { setDetailDrafts((current) => current.map((item) => String(item.id) === pricingDetailId ? applyPricingSnapshot(item, snapshot) : item)); setPricingDetailId(null); }} /> : null;
      })() : null}
      {mode === "purchase" ? (
        <PurchaseOrderDemandPlanTabs
          poNo={String(master.poNo ?? "")}
          purchaseOrderId={String(master.purchaseOrderId ?? id)}
        />
      ) : null}
      <AuditInfoBar
        createdBy={master.createdByName}
        createdAt={master.createdAt}
        updatedBy={master.updatedByName}
        updatedAt={master.updatedAt}
        confirmedBy={master.confirmedByName}
        confirmedAt={master.confirmedAt}
      />
    </div>
  );
}

type OrderDetailResponse = {
  master?: Row | null;
  details?: Row[];
  requestItems?: Row[];
  instanceModels?: Row[];
};

function Info({ label, value, type }: { label: string; value: unknown; type?: string }) {
  return (
    <div className="border border-[#ebeef5] bg-[#fafafa] p-3">
      <div className="text-xs text-[#909399]">{label}</div>
      <div className="mt-1 truncate text-sm text-[#303133]">{formatValue(value, type)}</div>
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

function formatValue(value: unknown, type?: string) {
  return formatDisplayValue(value as string | number | boolean | null | undefined, type);
}

function getDetailDisplayValue(row: Row, key: string) {
  if (key === "supplierId" || key === "supplierCode" || key === "supplierName") return row.supplierDisplayName ?? row[key];
  if (key === "undertakingUnitId" || key === "undertakingUnitCode" || key === "undertakingUnitName") return row.undertakingUnitDisplayName ?? row[key];
  if (key === "customerId" || key === "customerCode" || key === "customerName") return row.customerDisplayName ?? row[key];
  return row[key];
}

function formatPowerPrice(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}
