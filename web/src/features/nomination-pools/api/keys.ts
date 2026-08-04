/**
 * nominationPoolsKeys — query/mutation keys для фичи nomination-pools
 * (спека 0009). Иерархия: ['nomination-pools', <scope>, ...params] (см.
 * ADR 0006). `layout` ключуется `stageId` (спека 0018, FR-18: раскладка
 * теперь адресуется этапом, не номинацией) — строковое имя ключа не менялось,
 * инвалидация продолжает работать по значению параметра.
 */
export const nominationPoolsKeys = {
  layout: (stageId: string) => ["nomination-pools", "layout", stageId] as const,
  bouts: (nominationId: string) => ["nomination-pools", "bouts", nominationId] as const,
};
