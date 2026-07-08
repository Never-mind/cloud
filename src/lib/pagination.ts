export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function normalizePageSize(pageSize: number) {
  return PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE;
}

export function getPaginationState(total: number, page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const normalizedPageSize = normalizePageSize(pageSize);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = Math.min(Math.max(1, page), totalPages);

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
    start: total === 0 ? 0 : (normalizedPage - 1) * normalizedPageSize + 1,
    end: Math.min(total, normalizedPage * normalizedPageSize),
  };
}

export function paginateRows<T>(rows: T[], page: number, pageSize = DEFAULT_PAGE_SIZE) {
  const state = getPaginationState(rows.length, page, pageSize);
  return rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
}
