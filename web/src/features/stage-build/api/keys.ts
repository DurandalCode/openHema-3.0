/**
 * stageBuildKeys — query/mutation keys для фичи `stage-build` (спека 0019,
 * FR-13..FR-24). Иерархия: ['stage-build', <scope>, ...params] (см. ADR
 * 0006, по образцу `features/bracket-seeding/api/keys.ts`). Превью формально
 * не query-кэш (см. `use-build-preview.ts` — это `useMutation`, а не
 * `useQuery`: результат зависит от текущих `ties`, а не только от `stageId`),
 * но ключ всё равно полезен как стабильный идентификатор скоупа для
 * возможной ручной инвалидации/дебага.
 */
export const stageBuildKeys = {
  preview: (stageId: string) => ["stage-build", "preview", stageId] as const,
};
