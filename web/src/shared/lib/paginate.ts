/** Элемент окна пагинации: номер страницы или разрыв-многоточие. */
export type PaginationItem = number | "ellipsis";

/**
 * Порог, ниже которого весь диапазон страниц показывается целиком: сжатие в
 * многоточие экономит место только когда страниц ощутимо больше, чем влезло
 * бы в окно (1 + сосед + сосед + 1 + запас).
 */
const SHOW_ALL_THRESHOLD = 7;

/**
 * paginationWindow — набор номеров страниц для отображения (FR-10):
 * всегда первая и последняя страница, соседи текущей, разрывы сворачиваются
 * в один элемент `"ellipsis"`. `page` кламп(ится) в диапазон `[1, pageCount]`.
 */
export function paginationWindow(
  page: number,
  pageCount: number,
): PaginationItem[] {
  if (pageCount <= 0) return [];
  if (pageCount === 1) return [1];
  if (pageCount <= SHOW_ALL_THRESHOLD) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const current = Math.min(Math.max(page, 1), pageCount);

  const pages = new Set<number>([1, pageCount, current]);
  if (current - 1 >= 1) pages.add(current - 1);
  if (current + 1 <= pageCount) pages.add(current + 1);

  const sorted = Array.from(pages).sort((a, b) => a - b);

  const result: PaginationItem[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push("ellipsis");
    }
    result.push(sorted[i]);
  }
  return result;
}
