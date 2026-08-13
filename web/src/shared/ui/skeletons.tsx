import { cn } from "@/shared/lib/cn";
import { Skeleton } from "@/shared/ui/skeleton";

export type SkeletonRowsProps = {
  /** Число строк-скелетонов. По умолчанию — 5. */
  rows?: number;
  /** Число колонок в каждой строке. По умолчанию — 4. */
  cols?: number;
  className?: string;
};

/**
 * SkeletonRows — скелетон в форме таблицы/списка (FR-1): столько строк и
 * колонок, сколько задано, чтобы подстановка реальных данных не сдвигала
 * вёрстку. Строится поверх `Skeleton` (0022).
 */
export function SkeletonRows({ rows = 5, cols = 4, className }: SkeletonRowsProps) {
  return (
    <div data-slot="skeleton-rows" className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          data-slot="skeleton-row"
          className="flex items-center gap-4 border-b border-border px-6"
          style={{ height: "var(--row-h)" }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export type SkeletonCardsProps = {
  /** Число карточек-скелетонов. По умолчанию — 3. */
  count?: number;
  className?: string;
};

/**
 * SkeletonCards — скелетон в форме сетки карточек (FR-1).
 */
export function SkeletonCards({ count = 3, className }: SkeletonCardsProps) {
  return (
    <div
      data-slot="skeleton-cards"
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          data-slot="skeleton-card"
          className="flex flex-col gap-3 rounded-lg border border-border p-4"
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
