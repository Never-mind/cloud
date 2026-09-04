"use client";

import { useMemo, useState } from "react";
import { Calculator, ChevronDown, ChevronUp, Clock3, Info, RotateCcw, X } from "lucide-react";
import { calculatePowerServicePrice as calculateServicePrice, getPowerPriceDefaults, type PowerPriceInputs } from "@/lib/power-price-calculator";
import { Button, Input, Panel } from "./ui";

type CountryCode = "MX" | "CL" | "BR";
type Currency = "CNY" | "USD";
type B6Type = "B61" | "B62-A7" | "B62-A8" | "B62-A9" | "B63";

type PurchaseLine = {
  countryCode: CountryCode;
  purchaseCurrency: Currency;
  deviceCode: string;
  model: B6Type;
  productName: string;
  quantity: number;
  taxExcludedUnitPrice: number;
  taxSurcharge: number;
};

type PricingInputs = PowerPriceInputs;

type ManualPriceOverrides = {
  first24VatIncluded?: number;
  next36VatIncluded?: number;
};

const initialPurchase: PurchaseLine = {
  countryCode: "MX",
  purchaseCurrency: "CNY",
  deviceCode: "06114506-001",
  model: "B62-A7",
  productName: "a2YS01 磁盘增强 A 型 2",
  quantity: 1,
  taxExcludedUnitPrice: 23418.9251,
  taxSurcharge: 0,
};

const historicalContracts = [
  { version: "实例合同 MX-202606-014", date: "2026-06-18", first: 181.2, next: 1.12 },
  { version: "实例合同 MX-202601-008", date: "2026-01-12", first: 176.8, next: 1.08 },
];

export function PurchasePriceCalculationDemoPage() {
  const [purchase, setPurchase] = useState<PurchaseLine>(initialPurchase);
  const [manualInputs, setManualInputs] = useState<Partial<PricingInputs>>({});
  const [manualPrices, setManualPrices] = useState<ManualPriceOverrides>({});
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [showFormula, setShowFormula] = useState(true);

  const defaults = useMemo(() => getDefaults(purchase, manualInputs.exchangeRate), [purchase, manualInputs.exchangeRate]);
  const inputs = useMemo(() => ({ ...defaults, ...manualInputs }), [defaults, manualInputs]);
  const calculatedResult = useMemo(() => calculatePowerServicePrice(inputs), [inputs]);
  const result = useMemo(() => ({
    ...calculatedResult,
    first24VatIncluded: manualPrices.first24VatIncluded ?? calculatedResult.first24VatIncluded,
    next36VatIncluded: manualPrices.next36VatIncluded ?? calculatedResult.next36VatIncluded,
  }), [calculatedResult, manualPrices]);

  function updatePurchase<K extends keyof PurchaseLine>(key: K, value: PurchaseLine[K]) {
    setPurchase((current) => ({ ...current, [key]: value }));
    if (key === "purchaseCurrency") {
      setManualInputs((current) => {
        const { capexWithoutVatCny: _capex, ...rest } = current;
        return rest;
      });
      setManualPrices({});
    }
  }

  function updateManualInput<K extends keyof PricingInputs>(key: K, value: PricingInputs[K]) {
    setManualInputs((current) => ({ ...current, [key]: value }));
  }

  function updateManualPrice<K extends keyof ManualPriceOverrides>(key: K, value: number) {
    setManualPrices((current) => ({ ...current, [key]: value }));
  }

  function resetInputs() {
    setManualInputs({});
    setManualPrices({});
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-medium text-[#303133]">算力采购服务费测算</h1><span className="border border-[#b3d8ff] bg-[#ecf5ff] px-2 py-0.5 text-xs text-[#409eff]">演示</span></div>
          <p className="mt-1 text-sm text-[#909399]">采购单可使用 CNY 或 USD；测算统一换算为人民币 CAPEX 后，按算力服务费定价模板计算。</p>
        </div>
        <Button className="ml-auto" tone="primary" onClick={() => setDrawerOpen(true)}><Calculator size={15} />价格测算</Button>
      </div>

      <Panel>
        <div className="flex items-center justify-between border-b border-[#ebeef5] px-4 py-3"><div><div className="font-medium text-[#303133]">采购订单明细</div><div className="mt-1 text-xs text-[#909399]">PO-20260903-0001 · {defaults.countryName} · 采购币种 {purchase.purchaseCurrency}</div></div><span className="border border-[#d9ecff] bg-[#f4f9ff] px-2 py-1 text-xs text-[#409eff]">草稿</span></div>
        <div className="table-scroll overflow-auto"><table className="w-full min-w-[1530px] border-collapse text-sm"><thead className="bg-[#f5f7fa] text-[#303133]"><tr>{["行号", "设备编码", "B6 类型", "产品名称", "数量", "币种", "不含税单价", "税费加成", "CAPEX（不含 VAT，CNY）", "算力服务价格（1-24个月，含 VAT）", "算力服务价格（25-60个月，含 VAT）", "操作"].map((label) => <th className="whitespace-nowrap border-b border-r border-[#ebeef5] px-3 py-3 text-left font-medium" key={label}>{label}</th>)}</tr></thead><tbody><tr className="hover:bg-[#fafafa]"><td className="border-b border-r border-[#ebeef5] px-3 py-3">1</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-medium text-[#303133]">{purchase.deviceCode}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.model}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.productName}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.quantity}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.purchaseCurrency}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.purchaseCurrency} {money(purchase.taxExcludedUnitPrice, 4)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3">{purchase.purchaseCurrency} {money(purchase.taxSurcharge, 4)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-medium text-[#303133]">CNY {money(inputs.capexWithoutVatCny, 4)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-medium text-[#1890ff]">USD {money(result.first24VatIncluded)}</td><td className="border-b border-r border-[#ebeef5] px-3 py-3 font-medium text-[#13a65b]">USD {money(result.next36VatIncluded)}</td><td className="border-b border-[#ebeef5] px-3 py-3"><button className="inline-flex h-8 w-8 items-center justify-center border border-[#b3d8ff] text-[#1890ff] hover:bg-[#ecf5ff]" title="算力服务费测算" type="button" onClick={() => setDrawerOpen(true)}><Calculator size={15} /></button></td></tr></tbody></table></div>
      </Panel>

      {drawerOpen ? <><button aria-label="关闭价格测算" className="fixed inset-0 z-40 bg-black/20" type="button" onClick={() => setDrawerOpen(false)} /><aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[700px] flex-col border-l border-[#dcdfe6] bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#ebeef5] px-5 py-4"><div><div className="flex items-center gap-2 text-lg font-medium text-[#303133]"><Calculator className="text-[#1890ff]" size={19} />算力服务费测算</div><div className="mt-1 text-xs text-[#909399]">第 1 行 · {purchase.deviceCode} · {defaults.countryName} · 按 2026 年 6 月定价模板</div></div><button aria-label="关闭" className="text-[#909399] hover:text-[#303133]" title="关闭" type="button" onClick={() => setDrawerOpen(false)}><X size={19} /></button></div><div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <section><div className="mb-1 flex items-center justify-between"><SectionTitle title="本次算力服务价格" /><span className="text-xs text-[#909399]">默认按采购币种换算，可手工调整</span></div><div className="grid grid-cols-2 gap-3"><EditablePriceField emphasized label="1-24 个月（转合同币种，含 VAT）" value={result.first24VatIncluded} manual={manualPrices.first24VatIncluded !== undefined} onChange={(value) => updateManualPrice("first24VatIncluded", value)} /><EditablePriceField emphasized label="25-60 个月（转合同币种，含 VAT）" value={result.next36VatIncluded} manual={manualPrices.next36VatIncluded !== undefined} onChange={(value) => updateManualPrice("next36VatIncluded", value)} /><ResultField label="1-24 个月（转合同币种，不含 VAT）" value={`USD ${money(result.first24NoVatContract)}`} /><ResultField label="25-60 个月（转合同币种，不含 VAT）" value={`USD ${money(result.next36NoVatContract)}`} /></div></section>
        <section><SectionTitle icon={<Clock3 size={15} />} title="最近实例合同价格" /><div className="overflow-hidden border border-[#ebeef5]"><table className="w-full border-collapse text-xs"><thead className="bg-[#f5f7fa] text-[#606266]"><tr><th className="px-3 py-2 text-left font-medium">合同</th><th className="px-3 py-2 text-left font-medium">签署日期</th><th className="px-3 py-2 text-right font-medium">前 24 月</th><th className="px-3 py-2 text-right font-medium">后 36 月</th><th className="px-3 py-2 text-right font-medium">本次前 24 月差额</th><th className="px-3 py-2 text-right font-medium">本次后 36 月差额</th></tr></thead><tbody>{historicalContracts.map((contract) => <tr key={contract.version}><td className="border-t border-[#ebeef5] px-3 py-2 text-[#303133]">{contract.version}</td><td className="border-t border-[#ebeef5] px-3 py-2">{contract.date}</td><td className="border-t border-[#ebeef5] px-3 py-2 text-right">USD {money(contract.first)}</td><td className="border-t border-[#ebeef5] px-3 py-2 text-right">USD {money(contract.next)}</td><td className="border-t border-[#ebeef5] px-3 py-2 text-right">{formatDifference(result.first24VatIncluded - contract.first)}</td><td className="border-t border-[#ebeef5] px-3 py-2 text-right">{formatDifference(result.next36VatIncluded - contract.next)}</td></tr>)}</tbody></table></div><div className="mt-2 text-xs text-[#909399]">历史合同仅用于价格对比，不会自动覆盖本次服务费测算结果。</div></section>
        <section><SectionTitle title="采购订单带入" /><div className="grid grid-cols-2 gap-3"><SelectField label="国家/地区" value={purchase.countryCode} onChange={(value) => updatePurchase("countryCode", value as CountryCode)} options={[["MX", "墨西哥"], ["CL", "智利"], ["BR", "巴西"]]} /><SelectField label="采购币种" value={purchase.purchaseCurrency} onChange={(value) => updatePurchase("purchaseCurrency", value as Currency)} options={[["CNY", "CNY（人民币）"], ["USD", "USD（美元）"]]} /><ReadOnlyField label="设备编码" value={purchase.deviceCode} /><SelectField label="B6 类型" value={purchase.model} onChange={(value) => updatePurchase("model", value as B6Type)} options={[["B61", "B61"], ["B62-A7", "B62-A7"], ["B62-A8", "B62-A8"], ["B62-A9", "B62-A9"], ["B63", "B63"]]} /><NumberField label={`不含税单价（${purchase.purchaseCurrency}）`} value={purchase.taxExcludedUnitPrice} decimals={4} onChange={(value) => updatePurchase("taxExcludedUnitPrice", value)} /><NumberField label={`税费加成（${purchase.purchaseCurrency}）`} value={purchase.taxSurcharge} decimals={4} onChange={(value) => updatePurchase("taxSurcharge", value)} /></div><CurrencyConversionHint purchase={purchase} exchangeRate={inputs.exchangeRate} defaultCapex={defaults.capexWithoutVatCny} currentCapex={inputs.capexWithoutVatCny} manualCapex={manualInputs.capexWithoutVatCny !== undefined} /></section>
        <section><div className="mb-3 flex items-center justify-between"><SectionTitle title="费用计算参数" /><Button className="h-8 px-2 text-xs" type="button" onClick={resetInputs}><RotateCcw size={14} />按采购单和模板带入</Button></div><div className="grid grid-cols-2 gap-3"><NumberField label="CAPEX（不含 VAT，CNY）" value={inputs.capexWithoutVatCny} decimals={4} onChange={(value) => updateManualInput("capexWithoutVatCny", value)} /><NumberField label="整机价转合同汇率（CNY -> USD）" value={inputs.exchangeRate} decimals={6} onChange={(value) => updateManualInput("exchangeRate", value)} /><PercentField label="Onsite + RMA 费率" value={inputs.onsiteRmaRate} onChange={(value) => updateManualInput("onsiteRmaRate", value)} /><PercentField label="资金占用年利率" value={inputs.fundingAnnualRate} onChange={(value) => updateManualInput("fundingAnnualRate", value)} /><NumberField label="资金占用月数" value={inputs.fundingMonths} decimals={0} onChange={(value) => updateManualInput("fundingMonths", Math.max(0, Math.trunc(value)))} /><PercentField label="运保清关费率" value={inputs.transportClearanceRate} onChange={(value) => updateManualInput("transportClearanceRate", value)} /><PercentField label="总代过手费率" value={inputs.handlingRate} onChange={(value) => updateManualInput("handlingRate", value)} /><PercentField label="其他税费率" value={inputs.otherTaxRate} onChange={(value) => updateManualInput("otherTaxRate", value)} /><PercentField label="当地服务 VAT" value={inputs.serviceVatRate} onChange={(value) => updateManualInput("serviceVatRate", value)} /><NumberField label="模板整机基准价（CNY）" value={inputs.benchmarkCapexCny} decimals={4} onChange={(value) => updateManualInput("benchmarkCapexCny", value)} /><NumberField label="模板前 24 月基准服务费（CNY）" value={inputs.first24BaseFeeCny} decimals={4} onChange={(value) => updateManualInput("first24BaseFeeCny", value)} /><NumberField label="模板后 36 月基准服务费（CNY）" value={inputs.next36BaseFeeCny} decimals={4} onChange={(value) => updateManualInput("next36BaseFeeCny", value)} /></div></section>
        <section><SectionTitle title="测算过程" /><div className="grid grid-cols-2 gap-3"><ResultField label="资金占用费" value={`CNY ${money(result.fundingCostCny, 4)}`} /><ResultField label="CAPEX 合计" value={`CNY ${money(result.capexTotalCny, 4)}`} /><ResultField label="DDP 价格" value={`CNY ${money(result.ddpPriceCny, 4)}`} /><ResultField label="OPEX（均摊前 24 个月）" value={`CNY ${money(result.opexCny, 4)}`} /><ResultField label="1-24 月服务费（不含 VAT）" value={`CNY ${money(result.first24NoVatCny, 4)}`} /><ResultField label="25-60 月服务费（不含 VAT）" value={`CNY ${money(result.next36NoVatCny, 4)}`} /></div></section>
        <section className="border border-[#ebeef5]"><button className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-[#303133] hover:bg-[#fafafa]" type="button" onClick={() => setShowFormula((value) => !value)}><span className="flex items-center gap-2"><Info className="text-[#909399]" size={15} />表格计算公式</span>{showFormula ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{showFormula ? <div className="space-y-2 border-t border-[#ebeef5] bg-[#fafafa] px-3 py-3 text-xs leading-5 text-[#606266]"><div>1. 采购币种为 CNY 时，CAPEX 默认等于不含税单价 + 税费加成；采购币种为 USD 时，CAPEX 默认等于（不含税单价 + 税费加成）÷ 整机价转合同汇率。</div><div>2. CAPEX 合计 = CAPEX（不含 VAT）×（1 + Onsite/RMA 费率 + 年利率×资金占用月数÷12）。</div><div>3. DDP 价格 = CAPEX 合计 ×（1 + 运保清关费率）×（1 + 总代过手费率 + 其他税费率）。</div><div>4. OPEX = DDP 价格 - CAPEX 合计；OPEX 全额平均分摊至前 24 个月。</div><div>5. 前 24 月不含 VAT 服务费 = CAPEX 合计÷模板整机基准价×模板前 24 月基准服务费 + OPEX÷24。</div><div>6. 后 36 月不含 VAT 服务费 = CAPEX 合计÷模板整机基准价×模板后 36 月基准服务费。</div></div> : null}</section>
      </div></aside></> : null}
    </div>
  );
}

function getDefaults(purchase: PurchaseLine, exchangeRateOverride?: number): PricingInputs & { countryName: string } {
  const defaults = getPowerPriceDefaults({
    countryCode: purchase.countryCode,
    deviceCode: purchase.deviceCode,
    b6Type: purchase.model,
    purchaseCurrency: purchase.purchaseCurrency,
    taxExcludedUnitPrice: purchase.taxExcludedUnitPrice,
    taxSurcharge: purchase.taxSurcharge,
    exchangeRate: exchangeRateOverride,
  });
  return { ...defaults.inputs, countryName: defaults.countryName };
}

function calculatePowerServicePrice(input: PricingInputs) {
  return calculateServicePrice(input);
}

function CurrencyConversionHint({ purchase, exchangeRate, defaultCapex, currentCapex, manualCapex }: { purchase: PurchaseLine; exchangeRate: number; defaultCapex: number; currentCapex: number; manualCapex: boolean }) {
  const purchaseTotal = purchase.taxExcludedUnitPrice + purchase.taxSurcharge;
  const automaticContent = purchase.purchaseCurrency === "CNY"
    ? `采购币种为 CNY，CAPEX 默认直接取不含税单价 + 税费加成：CNY ${money(purchaseTotal, 4)}。`
    : `采购币种为 USD，按 USD ${money(purchaseTotal, 4)} ÷ ${formatRate(exchangeRate)} 反算：CNY ${money(defaultCapex, 4)}。`;
  const content = manualCapex ? `CAPEX 已手工调整为 CNY ${money(currentCapex, 4)}；点击“按采购单和模板带入”可恢复自动换算值。` : automaticContent;
  return <div className="mt-3 border border-[#d9ecff] bg-[#f4f9ff] px-3 py-2 text-xs leading-5 text-[#606266]">{content}</div>;
}

function round(value: number, digits: number) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function money(value: number, digits = 2) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
function percent(value: number) { return `${(Number(value || 0) * 100).toFixed(2)}%`; }
function formatRate(value: number) { return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }); }
function formatDifference(value: number) { return `${value >= 0 ? "+" : "-"}USD ${money(Math.abs(value))}`; }
function SectionTitle({ title, icon }: { title: string; icon?: React.ReactNode }) { return <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#303133]">{icon}{title}</div>; }
function ReadOnlyField({ label, value }: { label: string; value: string }) { return <div><div className="mb-1 block text-xs text-[#909399]">{label}</div><div className="flex h-9 items-center rounded border border-[#ebeef5] bg-[#f5f7fa] px-3 text-sm text-[#606266]">{value}</div></div>; }
function EditablePriceField({ label, value, manual, onChange, emphasized }: { label: string; value: number; manual: boolean; onChange: (value: number) => void; emphasized?: boolean }) {
  return <label className={`relative block border p-3 ${emphasized ? "border-[#b3d8ff] bg-[#f4f9ff]" : "border-[#ebeef5] bg-[#fafafa]"}`}>
    <span className="flex items-center justify-between gap-2 text-xs text-[#606266]"><span>{label}</span>{manual ? <span className="whitespace-nowrap text-[#e6a23c]">手工</span> : <span className="whitespace-nowrap text-[#67c23a]">自动</span>}</span>
    <span className="mt-1 flex h-9 items-center border border-[#dcdfe6] bg-white focus-within:border-[#1890ff]"><span className="pl-3 text-sm text-[#909399]">USD</span><input aria-label={label} className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-medium text-[#303133] outline-none" min="0" step="0.01" type="number" value={String(value)} onChange={(event) => onChange(Number(event.target.value || 0))} /></span>
  </label>;
}
function ResultField({ label, value, emphasized }: { label: string; value: string; emphasized?: boolean }) { return <div className={`border p-3 ${emphasized ? "border-[#b3d8ff] bg-[#f4f9ff]" : "border-[#ebeef5] bg-[#fafafa]"}`}><div className="text-xs text-[#909399]">{label}</div><div className={`mt-1 text-sm ${emphasized ? "font-medium text-[#1890ff]" : "text-[#303133]"}`}>{value}</div></div>; }
function NumberField({ label, value, decimals, onChange }: { label: string; value: number; decimals: number; onChange: (value: number) => void }) { return <label className="min-w-0"><span className="mb-1 block text-xs text-[#606266]">{label}</span><Input className="w-full" step={10 ** -decimals} type="number" value={String(value)} onChange={(event) => onChange(Number(event.target.value || 0))} /></label>; }
function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="min-w-0"><span className="mb-1 block text-xs text-[#606266]">{label}</span><div className="relative"><Input className="w-full pr-9" step="0.01" type="number" value={String(value * 100)} onChange={(event) => onChange(Number(event.target.value || 0) / 100)} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#909399]">%</span></div></label>; }
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) { return <label className="min-w-0"><span className="mb-1 block text-xs text-[#606266]">{label}</span><select className="h-9 w-full rounded border border-[#dcdfe6] bg-white px-3 text-sm outline-none focus:border-[#1890ff]" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>; }
