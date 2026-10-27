import { createHash } from "node:crypto";
import type { InvoiceRecognition } from "./invoice-recognition-service";

type RemoteEntry = Record<string, unknown>;
export type ReturnedAttachment = {
  title: string; url: string; size: number; createdAt: string;
  nodeId: string; origin: "timeline" | "comment"; remoteKey: string;
};
export function approvalAttachmentUrl(value: string) {
  const url = new URL(value);
  const allowed = ["feishucdn.com", "byteimg.com", "feishu.cn", "larksuitecdn.com", "larksuite.com"];
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")
    || !allowed.some(domain => url.hostname === domain || url.hostname.endsWith("." + domain))) throw new Error("回票附件地址不在飞书可信域名内");
  return url;
}
export function collectReturnedAttachments(data: { timeline?: RemoteEntry[]; comment_list?: RemoteEntry[]; task_list?: RemoteEntry[] }) {
  const found = new Map<string, ReturnedAttachment>();
  for (const [origin, entries] of [["timeline", data.timeline], ["comment", data.comment_list]] as const) {
    for (const entry of entries ?? []) {
      if (origin === "timeline" && ["START", "CC"].includes(String(entry.type))) continue;
      if (!Array.isArray(entry.files)) continue;
      for (const raw of entry.files as RemoteEntry[]) {
        const title = String(raw.title ?? "").trim(), url = String(raw.url ?? "");
        if (!/\.(pdf|ofd|xml|png|jpe?g)$/i.test(title) || !url) continue;
        const parsed = approvalAttachmentUrl(url);
        const key = createHash("sha256").update(parsed.hostname + parsed.pathname + title).digest("hex");
        const timestamp = Number(entry.create_time);
        const task = data.task_list?.find(item => String(item.id) === String(entry.task_id));
        found.set(key, { title, url, size: Number(raw.file_size ?? 0), remoteKey: key, origin,
          nodeId: String(task?.node_id ?? entry.node_key ?? ""),
          createdAt: timestamp > 0 && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "" });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function recognizedInvoiceIdentity(recognition: InvoiceRecognition | null) {
  const facts = recognition?.facts;
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s/g, "").toUpperCase();
  if (!facts?.invoiceNo || !facts.issuerTaxNumber) return "";
  return createHash("sha256").update(normalize(facts.issuerTaxNumber) + "|" + normalize(facts.invoiceNo)).digest("hex");
}
export type ReturnFileSummary = {
  id: string; fileName: string; invoiceIdentity: string; invoiceNo: string;
  invoiceId: string; recognition: InvoiceRecognition | null; recognitionError: string;
  createdAt?: string;
};
export function groupReturnedInvoices(files: ReturnFileSummary[]) {
  const groups = new Map<string, ReturnFileSummary[]>();
  for (const file of files) {
    let key = file.invoiceIdentity || file.id;
    // A filename can associate an unparsed rendition, but never supply financial facts.
    if (!file.recognition && !file.invoiceIdentity) {
      const candidates = files.filter(other => other.invoiceIdentity && other.invoiceNo.length >= 8 && file.fileName.includes(other.invoiceNo));
      const identities = [...new Set(candidates.map(other => other.invoiceIdentity))];
      if (identities.length === 1) key = identities[0];
    }
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const ranked = [...items].sort((a, b) => Number(Boolean(b.recognition)) - Number(Boolean(a.recognition))
      || Number(/\.pdf$/i.test(b.fileName)) - Number(/\.pdf$/i.test(a.fileName)));
    const primary = ranked[0];
    const facts = items.filter(item => item.recognition?.facts).map(item => item.recognition!.facts!);
    const comparable = (field: string, value: unknown) => {
      const text = String(value ?? "").trim();
      return ["amountIncludingTax", "amountExcludingTax", "taxAmount"].includes(field) && text && Number.isFinite(Number(text))
        ? String(Math.round(Number(text) * 100)) : text.toUpperCase();
    };
    const conflicting = facts.some(item => ["invoiceDate", "currency", "amountIncludingTax", "amountExcludingTax", "taxAmount", "receiverTaxNumber"]
      .some(field => comparable(field, item[field as keyof typeof item]) !== comparable(field, facts[0][field as keyof typeof item])));
    return { key, files: items, primary, conflicting, registered: items.some(item => Boolean(item.invoiceId)) };
  });
}
