/**
 * nominationManagementKeys — query/mutation keys для фичи nomination-management.
 * Иерархия: ['nomination-management', <scope>, ...params] (см. ADR 0006).
 */
export const nominationManagementKeys = {
  list: (tournamentId: string) => ["nomination-management", "list", tournamentId] as const,
  // stages — этапы + диагностика схемы одной номинации (спека 0028,
  // FR-5/FR-6). Ключ свой, не переиспользует ключ `features/stage-management`
  // (тот инвалидируется мутациями схемы соседней фичи — общий ключ связал бы
  // два экрана скрытой зависимостью, см. plan.md).
  stages: (nominationId: string) => ["nomination-management", "stages", nominationId] as const,
  // one — одна номинация (спека 0031, FR-2): инлайн-шапка экрана схемы
  // читает и обновляет одну номинацию, отдельно от списка `list`.
  one: (nominationId: string) => ["nomination-management", "one", nominationId] as const,
};
