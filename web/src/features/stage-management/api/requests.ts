import type { Stage } from "@/entities/stage/lib/types";

/**
 * requests — фетчеры фичи `stage-management` (спека 0018, FR-1/FR-2/FR-3):
 * список/создание/удаление этапов номинации. По образцу
 * `features/nomination-pools/api/requests.ts` — result-объекты
 * `{ok:true,...}|{ok:false,error}`, сеть/4xx маппятся единообразно.
 */

export type StagesResult = { ok: true; stages: Stage[] } | { ok: false; error: string };

export type CreateStageResult =
  | { ok: true; stage: Stage; stages: Stage[] }
  | { ok: false; error: string };

export type CreateStageInput = {
  title: string;
  bracketSize: number;
  thirdPlace: boolean;
};

/** listStagesRequest — GET /api/nominations/[id]/stages (список этапов номинации). */
export async function listStagesRequest(nominationId: string): Promise<StagesResult> {
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/stages`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { stages?: Stage[] };
    return { ok: true, stages: data.stages ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * createStageRequest — POST /api/nominations/[id]/stages: добавляет
 * этап-сетку (единственный создаваемый вручную тип, FR-1). BFF-ответ
 * оборачивает proto-поле `created` как `stage`.
 */
export async function createStageRequest(
  nominationId: string,
  input: CreateStageInput,
): Promise<CreateStageResult> {
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bracket",
        title: input.title,
        bracketSize: input.bracketSize,
        thirdPlace: input.thirdPlace,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { stage?: Stage; stages?: Stage[] };
    return { ok: true, stage: data.stage as Stage, stages: data.stages ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** deleteStageRequest — DELETE /api/stages/[stageId] (только сетка без начатых боёв, AC-14). */
export async function deleteStageRequest(stageId: string): Promise<StagesResult> {
  try {
    const res = await fetch(`/api/stages/${encodeURIComponent(stageId)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { stages?: Stage[] };
    return { ok: true, stages: data.stages ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
