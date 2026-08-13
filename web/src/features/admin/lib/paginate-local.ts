/**
 * paginate-local — ЛОКАЛЬНАЯ временная замена `shared/lib/paginate.ts`
 * (`pageSlice`, `clampPage`), которые параллельно строит Трек A (`tasks.md`,
 * T4) в другом worktree и которых в этом дереве ещё нет. Чтобы Трек B не
 * блокировался на Треке A, `UsersScreen` временно нарезает страницы этим
 * модулем; на join-волне (T13) вызывающий код переключается на реальный
 * `shared/lib/paginate.ts` с тем же сигнатурным контрактом, а этот файл
 * удаляется.
 */

/** pageSlice — чистая нарезка массива на страницу заданного размера (FR-23). */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

/** clampPage — приводит номер страницы в диапазон [1, pageCount] (пустой список → 1). */
export function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(page, 1), pageCount);
}
