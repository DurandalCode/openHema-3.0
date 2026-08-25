import { apiFetch } from "@/shared/api/api-fetch";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { Stage } from "@/entities/stage/lib/types";

/**
 * ReturnSeedingOutcome — исход восстановления посева после `ReturnFighter`
 * (спека 0040, FR-6):
 * - `{restored: true, poolNumber}` — боец найден в `pools[i].members` —
 *   восстановлен в прежний пул;
 * - `{restored: false}` — боец найден в `unassigned` хотя бы одной
 *   раскладки — посев не восстановлен, распределить придётся вручную;
 * - `null` — у активных номинаций бойца нет ни одного группового этапа с
 *   раскладкой вовсе (либо запрос не удался) — восстанавливать было нечего,
 *   уточнять тост не нужно (plan.md «Восстановление посева»: никакого
 *   нового поля ответа `ReturnFighter` не нужно — решение принимается по
 *   факту положения бойца в рефетченной раскладке).
 */
export type ReturnSeedingOutcome = { restored: true; poolNumber: number } | { restored: false } | null;

/** listGroupStages — этапы-группы номинации (только `STAGE_TYPE_GROUPS` — посев/пулы существуют только там). */
async function listGroupStages(nominationId: string): Promise<Stage[]> {
  const res = await apiFetch<{ stages?: Stage[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/stages`,
  );
  if (!res.ok) return [];
  return (res.data.stages ?? []).filter((s) => s.type === "STAGE_TYPE_GROUPS");
}

/** getLayout — раскладка этапа по пулам, `null` при ошибке/отсутствии. */
async function getLayout(stageId: string): Promise<PoolLayout | null> {
  const res = await apiFetch<{ layout?: PoolLayout | null }>(
    `/api/stages/${encodeURIComponent(stageId)}/layout`,
  );
  if (!res.ok) return null;
  return res.data.layout ?? null;
}

/**
 * resolveReturnSeeding определяет `ReturnSeedingOutcome` рефетчем раскладок
 * всех групповых этапов активных номинаций бойца (спека 0040, FR-6) —
 * best-effort: сетевой сбой на любом шаге не бросает исключение, просто
 * сужает результат (не мешает уже показанному тосту об успешном возврате).
 */
export async function resolveReturnSeeding(
  fighterId: string,
  nominationIds: string[],
): Promise<ReturnSeedingOutcome> {
  const uniqueNominationIds = Array.from(new Set(nominationIds));
  const stagesByNomination = await Promise.all(uniqueNominationIds.map(listGroupStages));
  const groupStageIds = stagesByNomination.flat().map((s) => s.id);

  if (groupStageIds.length === 0) return null;

  const layouts = await Promise.all(groupStageIds.map(getLayout));

  let sawFighterUnassigned = false;
  for (const layout of layouts) {
    if (!layout) continue;
    const pool = layout.pools.find((p) => p.members.some((m) => m.fighterId === fighterId));
    if (pool) return { restored: true, poolNumber: pool.number };
    if (layout.unassigned.some((m) => m.fighterId === fighterId)) sawFighterUnassigned = true;
  }

  return sawFighterUnassigned ? { restored: false } : null;
}
