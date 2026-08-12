"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { paginationWindow } from "@/shared/lib/paginate";
import { Button } from "@/shared/ui/button";

export type PaginationProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Pagination — презентационная навигация по страницам клиентского списка
 * (FR-10). Разметка — `<nav aria-label>`, текущая страница помечена
 * `aria-current="page"`, недоступные переходы (назад с первой, вперёд с
 * последней) — `disabled` (NFR-3, AC-10).
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  className,
}: PaginationProps) {
  const items = paginationWindow(page, pageCount);

  return (
    <nav
      data-slot="pagination"
      aria-label="Пагинация"
      className={cn("flex items-center gap-1", className)}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Назад"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeftIcon />
      </Button>

      {items.map((item, i) =>
        item === "ellipsis" ? (
          <span
            key={`ellipsis-${i}`}
            data-slot="pagination-ellipsis"
            className="px-2 text-sm text-caption-foreground"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <Button
            key={item}
            type="button"
            variant={item === page ? "default" : "ghost"}
            size="icon-sm"
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Вперёд"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRightIcon />
      </Button>
    </nav>
  );
}
