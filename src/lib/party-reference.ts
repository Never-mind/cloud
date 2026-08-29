export type PartyReferenceRow = Record<string, unknown>;

export type PartyReferenceCollections = {
  suppliers: PartyReferenceRow[];
  undertakingUnits: PartyReferenceRow[];
  customers: PartyReferenceRow[];
};

export function getPartyShortName(row: PartyReferenceRow, fallbackKeys: string[] = []) {
  for (const key of ["shortName", "nameCn", "entityName", "name", ...fallbackKeys]) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function resolvePartyReference(
  value: unknown,
  rows: PartyReferenceRow[],
  idKeys: string[],
  referenceKeys: string[],
) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  const match = rows.find((row) =>
    [...idKeys, ...referenceKeys].some((key) => String(row[key] ?? "").trim().toLowerCase() === normalized),
  );
  return match ? String(match[idKeys[0]] ?? raw) : raw;
}

export function getPartyReferenceLabel(row: PartyReferenceRow, codeKeys: string[], fallbackKeys: string[] = []) {
  const code = codeKeys.map((key) => String(row[key] ?? "").trim()).find(Boolean) ?? "";
  const shortName = getPartyShortName(row, fallbackKeys);
  return { code, shortName };
}

export function normalizePartyReferenceRow(row: PartyReferenceRow, references?: PartyReferenceCollections) {
  if (!references) return "";

  const fields = [
    { key: "supplierId", label: "供应商", rows: references.suppliers, idKey: "supplierId", referenceKeys: ["supplierCode", "shortName", "nameCn", "name"] },
    { key: "undertakingUnitId", label: "承接单位", rows: references.undertakingUnits, idKey: "undertakingUnitId", referenceKeys: ["undertakingUnitCode", "entityCode", "shortName", "entityName", "name"] },
    { key: "customerId", label: "客户", rows: references.customers, idKey: "customerId", referenceKeys: ["customerCode", "shortName", "nameCn", "name"] },
  ];

  for (const field of fields) {
    const raw = String(row[field.key] ?? "").trim();
    if (!raw) continue;
    const normalized = raw.toLowerCase();
    const known = field.rows.find((candidate) =>
      [field.idKey, ...field.referenceKeys].some((key) => String(candidate[key] ?? "").trim().toLowerCase() === normalized),
    );
    if (!known) return `${field.label}不存在：${raw}`;
    row[field.key] = String(known[field.idKey] ?? raw);
  }

  return "";
}
