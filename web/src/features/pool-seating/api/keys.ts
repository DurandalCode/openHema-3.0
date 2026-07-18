/**
 * poolSeatingKeys — query/mutation keys для фичи pool-seating (спека 0011).
 * Иерархия: ['pool-seating', <scope>, ...params] (см. ADR 0006).
 */
export const poolSeatingKeys = {
  forArena: (arenaId: string) => ["pool-seating", "for-arena", arenaId] as const,
  bouts: (nominationId: string) => ["pool-seating", "bouts", nominationId] as const,
};
