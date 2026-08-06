/**
 * bracketSeedingKeys — query/mutation keys для фичи `bracket-seeding` (спека
 * 0018). Иерархия: ['bracket-seeding', <scope>, ...params] (см. ADR 0006, по
 * образцу `features/nomination-pools/api/keys.ts`).
 */
export const bracketSeedingKeys = {
  bracket: (stageId: string) => ["bracket-seeding", "bracket", stageId] as const,
};
