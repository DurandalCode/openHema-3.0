/**
 * arenaJournalKeys — query keys для фичи arena-journal (спека 0033, FR-33).
 * Иерархия: ['arena-journal', <scope>, ...params] (см. ADR 0006). Журнал
 * читается per-арена (журнал боёв пула, стоящего на ней), поэтому
 * единственный ключ — по `arenaId`.
 */
export const arenaJournalKeys = {
  journal: (arenaId: string) => ["arena-journal", "journal", arenaId] as const,
};
