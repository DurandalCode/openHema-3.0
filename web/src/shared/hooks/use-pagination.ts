"use client";

import { useEffect, useMemo, useState } from "react";

export type UsePaginationResult<T> = {
  pageItems: T[];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
};

/**
 * usePagination — клиентская нарезка уже полученного списка на страницы
 * (FR-10). Серверная постраничная выдача — вне скоупа (NFR-2).
 *
 * Если список сжался (фильтр, удаление) так, что текущая страница больше не
 * существует, страница сбрасывается на последнюю доступную.
 */
export function usePagination<T>(
  items: T[],
  pageSize: number,
): UsePaginationResult<T> {
  const [page, setPageState] = useState(1);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), pageCount);

  useEffect(() => {
    if (page !== clampedPage) {
      setPageState(clampedPage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedPage]);

  const pageItems = useMemo(() => {
    const start = (clampedPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, clampedPage, pageSize]);

  function setPage(next: number) {
    setPageState(Math.min(Math.max(next, 1), pageCount));
  }

  return { pageItems, page: clampedPage, pageCount, setPage };
}
