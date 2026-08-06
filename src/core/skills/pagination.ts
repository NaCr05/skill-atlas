export const DEFAULT_CATALOG_PAGE_SIZE = 20;

export type CatalogPage<T> = Readonly<{
  items: T[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  start: number;
  end: number;
}>;

export function paginateCatalog<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize = DEFAULT_CATALOG_PAGE_SIZE,
): CatalogPage<T> {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : DEFAULT_CATALOG_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const normalizedPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1;
  const page = Math.min(pageCount, Math.max(1, normalizedPage));
  const offset = (page - 1) * safePageSize;
  const pageItems = items.slice(offset, offset + safePageSize);

  return {
    items: pageItems,
    page,
    pageCount,
    pageSize: safePageSize,
    total: items.length,
    start: items.length ? offset + 1 : 0,
    end: offset + pageItems.length,
  };
}
