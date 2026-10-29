"use client";

import { useId } from "react";
import { SearchSelect, type SearchSelectOption } from "./search-select";

/** Shared layout only; each approval retains its own partner-loading logic. */
export function InvoiceApprovalPartners({
  customerOptions, unitOptions, customerId, undertakingUnitId, onChange, disabled = false, feishuCompany,
}: {
  customerOptions: SearchSelectOption[]; unitOptions: SearchSelectOption[];
  customerId: string; undertakingUnitId: string; disabled?: boolean; feishuCompany?: string;
  onChange: (key: "customerId" | "undertakingUnitId", value: string) => void;
}) {
  const id = useId();
  return <section aria-label="开票双方" className="rounded border border-line-soft bg-white p-4">
    <div className="mb-3"><h3 className="text-sm font-medium text-ink">开票双方</h3>
      <p className="mt-1 text-xs leading-5 text-ink-2">从业务伙伴库选择，自动带入开票资料；可选择与账单不同的开票双方。</p>
    </div>
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <label htmlFor={`${id}-unit`} className="mb-1.5 block text-sm font-medium text-ink-2">开票主体（承接单位）</label>
        <SearchSelect inputId={`${id}-unit`} appearance="partner" disabled={disabled} options={unitOptions} value={undertakingUnitId}
          placeholder="搜索承接单位名称、编码或税号" onChange={value=>onChange("undertakingUnitId",value)}/>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${id}-customer`} className="mb-1.5 block text-sm font-medium text-ink-2">开票客户</label>
        <SearchSelect inputId={`${id}-customer`} appearance="partner" disabled={disabled} options={customerOptions} value={customerId}
          placeholder="搜索客户名称、编码或税号" onChange={value=>onChange("customerId",value)}/>
      </div>
    </fieldset>
    {feishuCompany!==undefined?<div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line-soft pt-3 text-xs leading-5 text-ink-2">
      <p className="min-w-0 flex-1 break-words">飞书开票主体：<span className={feishuCompany?"text-ink":"text-warning-ink"}>{feishuCompany||"未匹配，请选择飞书流程支持的承接单位"}</span></p>
      <p className="shrink-0">所属项目组：<span className="font-medium text-ink">CLOUD</span></p>
    </div>:null}
  </section>;
}
