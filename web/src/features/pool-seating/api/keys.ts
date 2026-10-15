/**
 * poolSeatingKeys — query/mutation keys для фичи pool-seating (спека 0011).
 * Иерархия: ['pool-seating', <scope>, ...params] (см. ADR 0006).
 * `allForArenas` — префикс всех арен: мутация очереди одной арены может
 * менять очередь другой (перенос пула, спека 0063, FR-5).
 */
export const poolSeatingKeys = {
  allForArenas: ["pool-seating", "for-arena"] as const,
  forArena: (arenaId: string) => ["pool-seating", "for-arena", arenaId] as const,
  bouts: (nominationId: string) => ["pool-seating", "bouts", nominationId] as const,
};
