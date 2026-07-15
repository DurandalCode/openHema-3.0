/**
 * nominationPoolsKeys — query/mutation keys для фичи nomination-pools
 * (спека 0009). Иерархия: ['nomination-pools', <scope>, ...params] (см.
 * ADR 0006).
 */
export const nominationPoolsKeys = {
  layout: (nominationId: string) => ["nomination-pools", "layout", nominationId] as const,
  bouts: (nominationId: string) => ["nomination-pools", "bouts", nominationId] as const,
};
