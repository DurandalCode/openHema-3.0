/**
 * Бои внутри пула номинации (спека 0010) — сформированные round-robin пары
 * бойцов, порождаемые фиксацией раскладки пулов (draft → ready, спека 0009).
 *
 * Сериализуемая форма (без bigint/Date). `fighterA`/`fighterB` — снапшот
 * имени/клуба бойца на момент формирования (не перечитывается из fighter,
 * спека «Принятые решения» №5).
 */

export type FighterRef = {
  fighterId: string;
  name: string;
  club: string;
};

export type Bout = {
  id: string;
  poolId: string;
  nominationId: string;
  /** Тур (внутри одного тура боец участвует не более раза — FR-3a). */
  roundNumber: number;
  /** Итоговый порядок исполнения в пуле, 1..N, уникален в пределах poolId (FR-3a/FR-3b). */
  sequenceNumber: number;
  fighterA: FighterRef;
  fighterB: FighterRef;
};

/**
 * groupBoutsByPool группирует плоский список боёв номинации по `poolId` —
 * BFF отдаёт бои всех пулов одним списком, отсортированным по
 * `pool_id, sequence_number` (см. `ListBoutsByNomination`). Внутри каждой
 * группы бои дополнительно сортируются по `sequenceNumber` — чистая функция
 * не полагается на порядок входного массива (детерминизм, FR-7).
 */
export function groupBoutsByPool(bouts: Bout[]): Record<string, Bout[]> {
  const result: Record<string, Bout[]> = {};
  for (const bout of bouts) {
    const group = result[bout.poolId];
    if (group) {
      group.push(bout);
    } else {
      result[bout.poolId] = [bout];
    }
  }
  for (const poolId of Object.keys(result)) {
    result[poolId]!.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }
  return result;
}
