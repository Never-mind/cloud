type Row = Record<string, string | number | boolean | null>;

export function getPurchaseOrderForDetailLines(master: Row, masterDraft: Row, editing: boolean) {
  return editing ? { ...master, ...masterDraft } : master;
}
