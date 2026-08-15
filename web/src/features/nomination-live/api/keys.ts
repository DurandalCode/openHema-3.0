/**
 * nominationLiveKeys — query keys для фичи `nomination-live` (спека 0032).
 * Иерархия: ['nomination-live', <scope>, ...params] (см. ADR 0006, по
 * образцу `features/nomination-pools/api/keys.ts`). `snapshot` отдельный от
 * SSE-хука публичной страницы (`use-nomination-live.ts`) — тот держит
 * локальный `useState`, кэша TanStack Query не создаёт.
 */
export const nominationLiveKeys = {
  snapshot: (nominationId: string) => ["nomination-live", "snapshot", nominationId] as const,
};
