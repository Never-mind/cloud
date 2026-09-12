"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronUp, Clock3, Info, RotateCcw, X } from "lucide-react";
import {
  buildPowerPricingSnapshot,
  calculatePowerServicePrice,
  getPowerPriceDefaults,
  parsePowerPricingSnapshot,
  type PowerPriceContext,
  type PowerPriceInputs,
  type PowerPricingSnapshot,
} from "@/lib/power-price-calculator";
import type { InstanceContractPriceReference } from "@/lib/purchase-power-pricing-service";
import { Button, Input } from "./ui";
import { Drawer } from "./drawer";
import { NumberInput as NumberField } from "./number-input";

type PriceContextResponse = {
  history?: InstanceContractPriceReference[];
  storageReady?: boolean;
  error?: string;
};

const inputFields: Array<{ key: keyof PowerPriceInputs; label: string; type: "number" | "percent"; decimals?: number }> = [
  { key: "capexWithoutVatCny", label: "CAPEX不含VAT（CNY）", type: "number", decimals: 4 },
  { key: "exchangeRate", label: "整机价转合同汇率（CNY → USD）", type: "number", decimals: 15 },
  { key: "onsiteRmaRate", label: "Onsite + RMA费率", type: "percent" },
  { key: "fundingAnnualRate", label: "资金占用年利率", type: "percent" },
  { key: "fundingMonths", label: "资金占用月数", type: "number", decimals: 0 },
  { key: "transportClearanceRate", label: "运保清关费率", type: "percent" },
  { key: "handlingRate", label: "总代过手费率", type: "percent" },
  { key: "otherTaxRate", label: "其他税费率", type: "percent" },
  { key: "serviceVatRate", label: "当地服务VAT", type: "percent" },
  { key: "benchmarkCapexCny", label: "模板整机基准价（CNY）", type: "number", decimals: 4 },
  { key: "first24BaseFeeCny", label: "模板前24月基准服务费（CNY）", type: "number", decimals: 4 },
  { key: "next36BaseFeeCny", label: "模板后36月基准服务费（CNY）", type: "number", decimals: 4 },
];

export function PowerPriceCalculationDrawer({
  context,
  existingSnapshot,
  onClose,
  onApply,
}: {
  context: PowerPriceContext;
  existingSnapshot?: unknown;
  onClose: () => void;
  onApply: (snapshot: PowerPricingSnapshot) => void;
}) {
  const seed = useMemo(() => {
    const existing = parsePowerPricingSnapshot(existingSnapshot);
    return existing
      ? buildPowerPricingSnapshot(context, {
          manualInputKeys: existing.manualInputKeys,
          manualInputs: existing.inputs,
          manualPrices: existing.manualPrices,
        })
      : buildPowerPricingSnapshot(context);
  }, [context, existingSnapshot]);
  const [manualInputKeys, setManualInputKeys] = useState<Array<keyof PowerPriceInputs>>(seed.manualInputKeys);
  const [manualInputs, setManualInputs] = useState<PowerPriceInputs>(seed.inputs);
  const [manualPrices, setManualPrices] = useState<PowerPricingSnapshot["manualPrices"]>(seed.manualPrices);
  const [history, setHistory] = useState<InstanceContractPriceReference[]>([]);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [showFormula, setShowFormula] = useState(true);

  useEffect(() => {
    setManualInputKeys(seed.manualInputKeys);
    setManualInputs(seed.inputs);
    setManualPrices(seed.manualPrices);
  }, [seed]);

  useEffect(() => {
    const params = new URLSearchParams({
      countryCode: context.countryCode,
      deviceCode: context.deviceCode,
      b6Type: context.b6Type ?? "",
      purchaseCurrency: context.purchaseCurrency,
      taxExcludedUnitPrice: String(context.taxExcludedUnitPrice ?? 0),
      taxSurcharge: String(context.taxSurcharge ?? 0),
      exchangeRate: String(context.exchangeRate ?? 0),
    });
    let cancelled = false;
    setLoadingHistory(true);
    setHistoryError("");
    void fetch(`/api/purchase-orders/price-context?${params.toString()}`)
      .then(async (response) => {
        const data = (await response.json()) as PriceContextResponse;
        if (!response.ok) throw new Error(data.error || "历史合同加载失败");
        if (cancelled) return;
        setHistory(data.history ?? []);
        setStorageReady(data.storageReady ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : "历史合同加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context.b6Type, context.countryCode, context.deviceCode, context.exchangeRate, context.purchaseCurrency, context.taxExcludedUnitPrice, context.taxSurcharge]);

  const defaults = getPowerPriceDefaults(context);
  const inputs = { ...defaults.inputs };
  for (const key of manualInputKeys) inputs[key] = manualInputs[key];
  const calculated = calculatePowerServicePrice(inputs);
  const result = {
    ...calculated,
    first24VatIncluded: manualPrices.first24VatIncluded ?? calculated.first24VatIncluded,
    next36VatIncluded: manualPrices.next36VatIncluded ?? calculated.next36VatIncluded,
  };

  function updateInput(key: keyof PowerPriceInputs, value: number) {
    setManualInputKeys((current) => current.includes(key) ? current : [...current, key]);
    setManualInputs((current) => ({ ...current, [key]: value }));
  }

  function resetInput(key: keyof PowerPriceInputs) {
    setManualInputKeys((current) => current.filter((item) => item !== key));
  }

  function resetAll() {
    setManualInputKeys([]);
    setManualInputs(seed.inputs);
    setManualPrices({});
  }

  function apply() {
    onApply(buildPowerPricingSnapshot(context, { manualInputKeys, manualInputs, manualPrices: {
      first24VatIncluded: manualPrices.first24VatIncluded,
      next36VatIncluded: manualPrices.next36VatIncluded,
    }}));
  }

  return (
    <Drawer
      description={<>{context.deviceCode} · {defaults.countryName} · 采购币种 {context.purchaseCurrency || "未填写"} · 合同币种 USD</>}
      footer={
        <>
          <Button type="button" onClick={onClose}>取消</Button>
          <Button tone="primary" type="button" disabled={storageReady === false} onClick={apply}>应用到采购明细</Button>
        </>
      }
      onClose={onClose}
      title={<><Calculator className="text-primary" size={19} />算力服务费测算</>}
      widthClass="max-w-[760px]"
    >
          <section>
            <div className="mb-2 flex items-center justify-between"><SectionTitle title="本次算力服务价格" /><span className="text-xs text-ink-3">默认自动计算，可手工调整</span></div>
            <div className="grid grid-cols-2 gap-3">
              <EditablePrice label="1-24个月（含VAT）" value={result.first24VatIncluded} manual={manualPrices.first24VatIncluded !== undefined} onChange={(value) => setManualPrices((current) => ({ ...current, first24VatIncluded: value }))} />
              <EditablePrice label="后36个月（含VAT）" value={result.next36VatIncluded} manual={manualPrices.next36VatIncluded !== undefined} onChange={(value) => setManualPrices((current) => ({ ...current, next36VatIncluded: value }))} />
            </div>
          </section>

          <section><SectionTitle icon={<Clock3 size={15} />} title="最近实例合同价格" />
            {loadingHistory ? <div className="border border-line-soft px-3 py-5 text-center text-xs text-ink-3">正在加载历史合同…</div> : historyError ? <div className="border border-[#fbc4c4] bg-danger-soft px-3 py-3 text-xs text-danger">{historyError}</div> : <div className="table-scroll overflow-auto border border-line-soft"><table className="w-full min-w-[680px] border-collapse text-xs"><thead className="bg-canvas text-ink-2"><tr><th className="px-3 py-2 text-left font-medium">合同</th><th className="px-3 py-2 text-left font-medium">签署日期</th><th className="px-3 py-2 text-right font-medium">前24个月</th><th className="px-3 py-2 text-right font-medium">后36个月</th><th className="px-3 py-2 text-right font-medium">前24个月差额</th><th className="px-3 py-2 text-right font-medium">后36个月差额</th></tr></thead><tbody>{history.map((item) => <tr key={`${item.contractNo}-${item.dateSigned ?? ""}`}><td className="border-t border-line-soft px-3 py-2 text-ink">{item.contractNo}</td><td className="border-t border-line-soft px-3 py-2">{item.dateSigned ?? "-"}</td><td className="border-t border-line-soft px-3 py-2 text-right">USD {money(item.first24MonthPriceUSD)}</td><td className="border-t border-line-soft px-3 py-2 text-right">USD {money(item.next36MonthPriceUSD)}</td><td className="border-t border-line-soft px-3 py-2 text-right">{difference(result.first24VatIncluded, item.first24MonthPriceUSD)}</td><td className="border-t border-line-soft px-3 py-2 text-right">{difference(result.next36VatIncluded, item.next36MonthPriceUSD)}</td></tr>)}{!history.length ? <tr><td className="py-7 text-center text-ink-3" colSpan={6}>暂无匹配的历史实例合同</td></tr> : null}</tbody></table></div>}
            <div className="mt-2 text-xs text-ink-3">历史合同仅供参考，不会自动覆盖本次测算结果。</div>
          </section>

          <section><div className="mb-2 flex items-center justify-between"><SectionTitle title="采购订单带入" /><span className={`text-xs ${defaults.autoCapexSupported ? "text-success-strong" : "text-warning-deep"}`}>{defaults.autoCapexSupported ? "已按采购币种自动换算" : "需要手工填写人民币CAPEX"}</span></div><div className="grid grid-cols-2 gap-3"><ReadOnlyField label="采购币种" value={context.purchaseCurrency || "-"} /><ReadOnlyField label="不含税单价" value={`${context.purchaseCurrency || "-"} ${money(context.taxExcludedUnitPrice, 4)}`} /><ReadOnlyField label="税费加成金额" value={`${context.purchaseCurrency || "-"} ${money(context.taxSurcharge, 4)}`} /><ReadOnlyField label="设备编码" value={context.deviceCode || "-"} /></div><div className="mt-3 border border-[#d9ecff] bg-[#f4f9ff] px-3 py-2 text-xs leading-5 text-ink-2">{defaults.conversionHint}</div></section>

          <section><div className="mb-2 flex items-center justify-between"><SectionTitle title="费用计算参数" /><Button size="sm" type="button" onClick={resetAll}><RotateCcw size={14} />恢复自动值</Button></div><div className="grid grid-cols-2 gap-3">{inputFields.map((field) => { const manual = manualInputKeys.includes(field.key); const value = inputs[field.key]; return <label className="min-w-0" key={field.key}><span className="mb-1 flex items-center justify-between gap-2 text-xs text-ink-2"><span>{field.label}</span>{manual ? <button className="shrink-0 text-warning-deep hover:underline" type="button" onClick={() => resetInput(field.key)}>自动</button> : <span className="shrink-0 text-success-strong">自动</span>}</span><div className="relative"><NumberField className={`w-full ${field.type === "percent" ? "pr-9" : ""}`} step={field.type === "percent" ? "0.01" : 10 ** -(field.decimals ?? 4)} value={field.type === "percent" ? value * 100 : value} onChange={(text) => { const parsed = Number(text || 0); updateInput(field.key, field.type === "percent" ? parsed / 100 : field.key === "fundingMonths" ? Math.trunc(parsed) : parsed); }} />{field.type === "percent" ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-3">%</span> : null}</div></label>; })}</div></section>

          <section><SectionTitle title="费用计算过程" /><div className="grid grid-cols-2 gap-3"><ResultField label="资金占用费" value={`CNY ${money(result.fundingCostCny, 4)}`} /><ResultField label="CAPEX合计" value={`CNY ${money(result.capexTotalCny, 4)}`} /><ResultField label="DDP价格" value={`CNY ${money(result.ddpPriceCny, 4)}`} /><ResultField label="OPEX（前24个月均摊）" value={`CNY ${money(result.opexCny, 4)}`} /><ResultField label="1-24个月服务费（不含VAT）" value={`USD ${money(result.first24NoVatContract)}`} /><ResultField label="后36个月服务费（不含VAT）" value={`USD ${money(result.next36NoVatContract)}`} /></div></section>

          <section className="border border-line-soft"><button className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-ink hover:bg-surface-2" type="button" onClick={() => setShowFormula((value) => !value)}><span className="flex items-center gap-2"><Info className="text-ink-3" size={15} />计算公式</span>{showFormula ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{showFormula ? <div className="space-y-2 border-t border-line-soft bg-surface-2 px-3 py-3 text-xs leading-5 text-ink-2"><div>1. CNY采购：CAPEX不含VAT = 不含税单价 + 税费加成金额。</div><div>2. USD采购：CAPEX不含VAT =（不含税单价 + 税费加成金额）÷ 整机价转合同汇率。</div><div>3. 资金占用费 = CAPEX不含VAT × 年资金费率 × 资金占用月数 ÷ 12。</div><div>4. CAPEX合计 = CAPEX不含VAT ×（1 + Onsite/RMA费率）+ 资金占用费。</div><div>5. DDP价格 = CAPEX合计 ×（1 + 运保清关费率）×（1 + 总代过手费率 + 其他税费率）。</div><div>6. OPEX = DDP价格 - CAPEX合计；OPEX全部平均分摊到前24个月。</div><div>7. 前24/后36个月服务费按模板整机基准价和对应基准服务费比例计算，再转为合同币种并加入当地服务VAT。</div></div> : null}</section>
          {storageReady === false ? <div className="border border-[#f5dab1] bg-warning-soft px-3 py-2 text-xs text-warning-deep">数据库尚未创建算力服务费测算字段。可以继续预览，但应用结果前请先执行本次迁移 SQL。</div> : null}
    </Drawer>
  );
}

function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) { return <div className="flex items-center gap-2 text-sm font-medium text-ink">{icon}{title}</div>; }
function ReadOnlyField({ label, value }: { label: string; value: string }) { return <div><div className="mb-1 text-xs text-ink-3">{label}</div><div className="flex h-9 items-center border border-line-soft bg-canvas px-3 text-sm text-ink-2">{value}</div></div>; }
function ResultField({ label, value }: { label: string; value: string }) { return <div className="border border-line-soft bg-surface-2 p-3"><div className="text-xs text-ink-3">{label}</div><div className="mt-1 text-sm font-medium text-ink">{value}</div></div>; }
function EditablePrice({ label, value, manual, onChange }: { label: string; value: number; manual: boolean; onChange: (value: number) => void }) { return <label className="border border-info-border bg-[#f4f9ff] p-3"><span className="flex items-center justify-between gap-2 text-xs text-ink-2"><span>{label}</span><span className={manual ? "text-warning-deep" : "text-success-strong"}>{manual ? "手工" : "自动"}</span></span><span className="mt-1 flex h-9 items-center border border-line bg-white focus-within:border-primary"><span className="pl-3 text-sm text-ink-3">USD</span><NumberField bare aria-label={label} className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-ink outline-none" min="0" step="0.01" value={value} onChange={(text) => onChange(Number(text || 0))} /></span></label>; }
function money(value: unknown, digits = 2) { const number = Number(value ?? 0); return Number.isFinite(number) ? number.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "0.00"; }
function difference(current: number, previous: unknown) {
  if (previous === null || previous === undefined || String(previous).trim() === "") return "-";
  const value = current - Number(previous);
  const tone = value > 0 ? "text-danger" : value < 0 ? "text-success-strong" : "text-ink-2";
  const label = value > 0 ? "高于" : value < 0 ? "低于" : "相同";
  return <span className={tone}>{label}{value === 0 ? "" : ` USD ${money(Math.abs(value))}`}</span>;
}
