import type { Bracket } from "@/entities/bracket/lib/types";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { StageBuildPreview, TieResolution } from "@/entities/stage/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

/**
 * requests — фетчеры фичи `stage-build` (спека 0019, FR-13..FR-24): превью
 * формирования этапа и само формирование. По образцу
 * `features/bracket-seeding/api/requests.ts` — result-объекты
 * `{ok:true,...}|{ok:false,error}`, сеть/4xx маппятся единообразно.
 */

export type PreviewStageBuildResult =
  | { ok: true; preview: StageBuildPreview }
  | { ok: false; error: string };

/**
 * BuildStageResult — ровно одно из `layout`/`bracket` непусто (0019, FR-16):
 * групповой целевой этап возвращает `layout`, сетка — `bracket` (симметрично
 * `GetLayout`/`GetBracket`).
 */
export type BuildStageResult =
  | { ok: true; layout: PoolLayout | null; bracket: Bracket | null }
  | { ok: false; error: string };

/**
 * previewStageBuildRequest — POST /api/stages/[stageId]/build/preview: без
 * побочных эффектов (FR-15), тело `ties` — ответы организатора на уже
 * известные дележи (0019, FR-22), собранные `lib/tie-resolution.ts`. Первый
 * вызов (до какого-либо дележа) шлёт `ties: []`.
 */
export async function previewStageBuildRequest(
  stageId: string,
  ties: TieResolution[],
): Promise<PreviewStageBuildResult> {
  const res = await apiFetch<{ preview?: StageBuildPreview }>(
    `/api/stages/${encodeURIComponent(stageId)}/build/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ties }),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, preview: res.data.preview as StageBuildPreview };
}

/**
 * buildStageRequest — POST /api/stages/[stageId]/build: применяет
 * формирование (FR-16). Отклоняется, если состав целевого этапа уже не пуст
 * (FR-18), есть пересечения веток (FR-11), превышена вместимость (FR-19)
 * либо остались неразрешённые дележи (FR-22) — сервер возвращает 4xx с
 * объяснением, клиент отдаёт его как `error`.
 */
export async function buildStageRequest(
  stageId: string,
  ties: TieResolution[],
): Promise<BuildStageResult> {
  const res = await apiFetch<{ layout?: PoolLayout | null; bracket?: Bracket | null }>(
    `/api/stages/${encodeURIComponent(stageId)}/build`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ties }),
    },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, layout: res.data.layout ?? null, bracket: res.data.bracket ?? null };
}
