"use client";
import { useCallback, useState } from "react";
import { Cloud, ReceiptText } from "lucide-react";
import { InvoiceApprovalPanel, type ApprovalPanelState } from "./invoice-approval-panel";
import { VatInvoiceApprovalPanel } from "./vat-invoice-approval-panel";
import { InvoiceApprovalProgress } from "./invoice-approval-progress";
import type { InvoiceAllocationPlan } from "@/lib/invoice-allocation";

export function InvoiceApprovalFlows(props: {
  active: boolean;
  sourceType: string; sourceId: string; sourceIds: string[];
  allocationPlan?: InvoiceAllocationPlan|null;onAllocationChange?:(plan:InvoiceAllocationPlan)=>void;
  onClose: () => void; onStateChange: (state: ApprovalPanelState) => void;
}) {
  const [flow, setFlow] = useState<"cloud" | "vat">("cloud");
  const [visitedVat, setVisitedVat] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const reportState = useCallback((state: ApprovalPanelState) => { setSubmitting(state.submitting || Boolean(state.preparingAttachments)); props.onStateChange(state); }, [props.onStateChange]);
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-5 border-b border-line-soft" role="tablist" aria-label="飞书审批流程">
      {([["cloud", "Cloud Invoice Process", Cloud], ["vat", "增值税开票申请", ReceiptText]] as const).map(([key, label, Icon]) => <button key={key} disabled={submitting} type="button" role="tab" aria-selected={flow === key}
        className={"flex items-center gap-2 border-b-2 pb-3 text-sm " + (flow === key ? "border-primary text-primary" : "border-transparent text-ink-3")}
        onClick={() => { setFlow(key); if (key === "vat") setVisitedVat(true); }}><Icon size={16} />{label}</button>)}
    </div>
    <InvoiceApprovalProgress sourceType={props.sourceType} sourceId={props.sourceId} />
    <div hidden={flow !== "cloud"}><InvoiceApprovalPanel {...props} onStateChange={props.active && flow === "cloud" ? reportState : undefined} /></div>
    {visitedVat ? <div hidden={flow !== "vat"}><VatInvoiceApprovalPanel {...props} onStateChange={reportState} active={props.active && flow === "vat"} onSubmitted={props.onClose} /></div> : null}
  </div>;
}
