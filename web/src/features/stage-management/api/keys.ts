/**
 * stageManagementKeys — query/mutation keys для фичи `stage-management`
 * (спека 0018). Иерархия: ['stage-management', <scope>, ...params] (см.
 * ADR 0006, по образцу `features/nomination-pools/api/keys.ts`).
 */
export const stageManagementKeys = {
  list: (nominationId: string) => ["stage-management", "list", nominationId] as const,
};
