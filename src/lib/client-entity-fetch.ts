export type ClientEntityRow = Record<string, string | number | boolean | null>;

export async function fetchAllEntityRows<T extends object = ClientEntityRow>(
  entity: string,
  filters: Record<string, string> = {},
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 100;
  let page = 1;
  let total = 0;

  do {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...filters });
    const response = await fetch(`/api/entities/${entity}?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "数据加载失败");

    const batch = (data.rows ?? []) as T[];
    rows.push(...batch);
    total = Number(data.total ?? rows.length);
    page += 1;

    if (!batch.length) break;
  } while (rows.length < total);

  return rows;
}
