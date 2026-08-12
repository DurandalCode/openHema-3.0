import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/shared/lib/cn";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

/**
 * Breadcrumbs — путь по иерархии (турнир → номинация → этап → пул, FR-11).
 * Все уровни, кроме последнего, — ссылки; последний — текст с
 * `aria-current="page"`. Презентационный, серверный компонент (без
 * интерактивности — `next/link` работает и без "use client").
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const lastIndex = items.length - 1;

  return (
    <nav
      data-slot="breadcrumbs"
      aria-label="Хлебные крошки"
      className={cn(
        "flex items-center gap-1 font-mono text-[11px] uppercase tracking-[.08em] text-caption-foreground",
        className,
      )}
    >
      <ol className="flex items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === lastIndex;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRightIcon className="size-3 text-caption-foreground/60" aria-hidden="true" />
              )}
              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className="text-foreground"
                >
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
