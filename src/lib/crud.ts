import { randomUUID } from "crypto";
import { execute, queryRows, type Row } from "./db";
import type { EntityConfig } from "./modules";

function quoteIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function getWritableFields(config: EntityConfig) {
  return config.formFields.map((field) => field.key);
}

function getInsertFields(config: EntityConfig) {
  return Array.from(new Set([config.primaryKey, ...getWritableFields(config)]));
}

function withPrimaryKey(config: EntityConfig, body: Row) {
  if (body[config.primaryKey]) return body;
  return {
    ...body,
    [config.primaryKey]: `${config.key}-${randomUUID()}`,
  };
}

export async function listEntityRows(config: EntityConfig, searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
  const keyword = searchParams.get("keyword")?.trim();
  const fields = Array.from(new Set([...config.listFields, ...config.formFields].map((field) => field.key)));
  const selectedFields = fields.map(quoteIdentifier).join(", ");
  const whereParts: string[] = [];
  const params: Row = { limit: pageSize, offset: (page - 1) * pageSize };

  if (keyword) {
    const keywordFields = fields.slice(0, 5);
    whereParts.push(
      `(${keywordFields.map((field) => `${quoteIdentifier(field)} LIKE :keyword`).join(" OR ")})`,
    );
    params.keyword = `%${keyword}%`;
  }

  for (const filter of config.filters) {
    if (filter.key === "keyword") continue;
    const value = searchParams.get(filter.key)?.trim();
    if (value) {
      whereParts.push(`${quoteIdentifier(filter.key)} = :${filter.key}`);
      params[filter.key] = value;
    }
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const orderBy = config.defaultSort ? `ORDER BY ${config.defaultSort}` : "";
  const table = quoteIdentifier(config.table);
  const [{ total }] = await queryRows<{ total: number }>(
    `SELECT COUNT(*) AS total FROM ${table} ${where}`,
    params,
  );
  const rows = await queryRows(
    `SELECT ${selectedFields} FROM ${table} ${where} ${orderBy} LIMIT :limit OFFSET :offset`,
    params,
  );

  return { rows, total, page, pageSize };
}

export async function getEntityRow(config: EntityConfig, id: string) {
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const rows = await queryRows(`SELECT * FROM ${table} WHERE ${primaryKey} = :id LIMIT 1`, { id });
  return rows[0] ?? null;
}

export async function createEntityRow(config: EntityConfig, body: Row) {
  const nextBody = withPrimaryKey(config, body);
  const fields = getInsertFields(config);
  const table = quoteIdentifier(config.table);
  const columns = fields.map(quoteIdentifier).join(", ");
  const values = fields.map((field) => `:${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, nextBody[field] ?? null]));

  await execute(`INSERT INTO ${table} (${columns}) VALUES (${values})`, params);
  return getEntityRow(config, String(nextBody[config.primaryKey]));
}

export async function updateEntityRow(config: EntityConfig, id: string, body: Row) {
  const fields = getWritableFields(config).filter((field) => field !== config.primaryKey);
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  const assignments = fields.map((field) => `${quoteIdentifier(field)} = :${field}`).join(", ");
  const params = Object.fromEntries(fields.map((field) => [field, body[field] ?? null]));

  await execute(`UPDATE ${table} SET ${assignments} WHERE ${primaryKey} = :id`, {
    ...params,
    id,
  });
  return getEntityRow(config, id);
}

export async function deleteEntityRow(config: EntityConfig, id: string) {
  const table = quoteIdentifier(config.table);
  const primaryKey = quoteIdentifier(config.primaryKey);
  await execute(`DELETE FROM ${table} WHERE ${primaryKey} = :id`, { id });
}

export async function replaceEntityRows(config: EntityConfig, rows: Row[]) {
  for (const row of rows) {
    await upsertEntityRow(config, row);
  }
}

export async function upsertEntityRow(config: EntityConfig, row: Row) {
  const existing = await getEntityRow(config, String(row[config.primaryKey]));
  if (existing) {
    await updateEntityRow(config, String(row[config.primaryKey]), row);
  } else {
    await createEntityRow(config, row);
  }
}
