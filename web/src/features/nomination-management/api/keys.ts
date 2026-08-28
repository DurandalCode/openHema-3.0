/**
 * nominationManagementKeys — query/mutation keys для фичи nomination-management.
 * Иерархия: ['nomination-management', <scope>, ...params] (см. ADR 0006).
 */
export const nominationManagementKeys = {
  list: (tournamentId: string) => ["nomination-management", "list", tournamentId] as const,
  // schemas — агрегирующая сводка схемы (этапы + диагностика) всех номинаций
  // турнира за одно обращение (спека 0041, FR-8/FR-10; заменяет прежний
  // ключ `stages(nominationId)` по одной номинации из спеки 0028, FR-5/FR-6).
  // Ключ свой, не переиспользует ключ `features/stage-management` (тот
  // инвалидируется мутациями схемы соседней фичи — общий ключ связал бы два
  // экрана скрытой зависимостью, см. plan.md).
  schemas: (tournamentId: string) => ["nomination-management", "schemas", tournamentId] as const,
  // one — одна номинация (спека 0031, FR-2): инлайн-шапка экрана схемы
  // читает и обновляет одну номинацию, отдельно от списка `list`.
  one: (nominationId: string) => ["nomination-management", "one", nominationId] as const,
};
