import type { Bracket } from "@/entities/bracket/lib/types";
import type { PoolLayout } from "@/entities/pool/lib/types";
import type { StageBuildPreview, TieResolution } from "@/entities/stage/lib/types";

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
  try {
    const res = await fetch(`/api/stages/${encodeURIComponent(stageId)}/build/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ties }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { preview?: StageBuildPreview };
    return { ok: true, preview: data.preview as StageBuildPreview };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
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
  try {
    const res = await fetch(`/api/stages/${encodeURIComponent(stageId)}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ties }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as {
      layout?: PoolLayout | null;
      bracket?: Bracket | null;
    };
    return { ok: true, layout: data.layout ?? null, bracket: data.bracket ?? null };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
