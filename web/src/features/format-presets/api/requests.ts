import type { FormatPreset, Stage } from "@/entities/stage/lib/types";

/**
 * requests — фетчеры фичи `format-presets` (спека 0020, FR-11/FR-12/FR-13/
 * FR-15): библиотека пресетов формата (список/сохранение/переименование/
 * удаление) и применение формата к номинации (пресет либо номинация-донор).
 * По образцу `features/stage-management/api/requests.ts` — result-объекты
 * `{ok:true,...}|{ok:false,error}`, сеть/4xx маппятся единообразно.
 */

export type FormatPresetsResult =
  | { ok: true; presets: FormatPreset[] }
  | { ok: false; error: string };

export type FormatPresetResult = { ok: true; preset: FormatPreset } | { ok: false; error: string };

export type DeleteFormatPresetResult = { ok: true } | { ok: false; error: string };

/**
 * ApplyFormatSource — источник схемы для применения (спека 0020, FR-13/
 * FR-15): ровно одно поле, пресет из библиотеки либо номинация-донор того же
 * турнира.
 */
export type ApplyFormatSource = { presetId: string } | { sourceNominationId: string };

export type ApplyFormatResult = { ok: true; stages: Stage[] } | { ok: false; error: string };

/** listFormatPresetsRequest — GET /api/formats (библиотека пресетов, FR-12). */
export async function listFormatPresetsRequest(): Promise<FormatPresetsResult> {
  try {
    const res = await fetch("/api/formats", { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { presets?: FormatPreset[] };
    return { ok: true, presets: data.presets ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * saveFormatPresetRequest — POST /api/formats: сохраняет схему номинации как
 * именованный пресет (FR-11). Имя обязательно и уникально — сервер отвечает
 * 409 при повторе (AC-17), клиент показывает его текст ошибки как есть.
 */
export async function saveFormatPresetRequest(
  name: string,
  nominationId: string,
): Promise<FormatPresetResult> {
  try {
    const res = await fetch("/api/formats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, nominationId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { preset?: FormatPreset };
    return { ok: true, preset: data.preset as FormatPreset };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** renameFormatPresetRequest — PATCH /api/formats/[presetId] (FR-12, только имя). */
export async function renameFormatPresetRequest(
  presetId: string,
  name: string,
): Promise<FormatPresetResult> {
  try {
    const res = await fetch(`/api/formats/${encodeURIComponent(presetId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { preset?: FormatPreset };
    return { ok: true, preset: data.preset as FormatPreset };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * deleteFormatPresetRequest — DELETE /api/formats/[presetId] (FR-12): не
 * трогает номинации, к которым пресет уже применялся (FR-16).
 */
export async function deleteFormatPresetRequest(presetId: string): Promise<DeleteFormatPresetResult> {
  try {
    const res = await fetch(`/api/formats/${encodeURIComponent(presetId)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * applyFormatRequest — POST /api/nominations/[id]/format: заменяет схему
 * номинации целиком (FR-13/FR-15/NFR-1) — из пресета библиотеки либо из
 * схемы номинации-донора. Разрешено, только если схема номинации не тронута
 * — сервер отклоняет иначе 409 (`FailedPrecondition`, FR-14), клиент
 * показывает его текст ошибки как есть.
 */
export async function applyFormatRequest(
  nominationId: string,
  source: ApplyFormatSource,
): Promise<ApplyFormatResult> {
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
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
