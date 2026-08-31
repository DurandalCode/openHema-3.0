import type { FormatPreset, Stage } from "@/entities/stage/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

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

export type FormatPresetResult =
  | { ok: true; preset: FormatPreset }
  | { ok: false; error: string; status?: number };

export type DeleteFormatPresetResult = { ok: true } | { ok: false; error: string; status?: number };

/**
 * ApplyFormatSource — источник схемы для применения (спека 0020, FR-13/
 * FR-15): ровно одно поле, пресет из библиотеки либо номинация-донор того же
 * турнира.
 */
export type ApplyFormatSource = { presetId: string } | { sourceNominationId: string };

export type ApplyFormatResult =
  | { ok: true; stages: Stage[] }
  | { ok: false; error: string; status?: number };

export type RestoreBuiltinPresetsResult =
  | { ok: true; restored: FormatPreset[]; skipped: number }
  | { ok: false; error: string; status?: number };

/** listFormatPresetsRequest — GET /api/formats (библиотека пресетов, FR-12). */
export async function listFormatPresetsRequest(): Promise<FormatPresetsResult> {
  const res = await apiFetch<{ presets?: FormatPreset[] }>("/api/formats", { method: "GET" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, presets: res.data.presets ?? [] };
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
  const res = await apiFetch<{ preset?: FormatPreset }>("/api/formats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, nominationId }),
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, preset: res.data.preset as FormatPreset };
}

/**
 * renameFormatPresetRequest — PATCH /api/formats/[presetId] (FR-12, только
 * имя). Ветка ошибки несёт HTTP-статус (спека 0029, B1) — на 409 (имя занято)
 * строится русское объяснение (`presetErrorMessage`), а не показывается
 * техническая строка сервера.
 */
export async function renameFormatPresetRequest(
  presetId: string,
  name: string,
): Promise<FormatPresetResult> {
  const res = await apiFetch<{ preset?: FormatPreset }>(
    `/api/formats/${encodeURIComponent(presetId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, preset: res.data.preset as FormatPreset };
}

/**
 * deleteFormatPresetRequest — DELETE /api/formats/[presetId] (FR-12): не
 * трогает номинации, к которым пресет уже применялся (FR-16). Ветка ошибки
 * несёт HTTP-статус (спека 0029, B1), как у `renameFormatPresetRequest`.
 */
export async function deleteFormatPresetRequest(presetId: string): Promise<DeleteFormatPresetResult> {
  const res = await apiFetch<unknown>(`/api/formats/${encodeURIComponent(presetId)}`, {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true };
}

/**
 * applyFormatRequest — POST /api/nominations/[id]/format: заменяет схему
 * номинации целиком (FR-13/FR-15/NFR-1) — из пресета библиотеки либо из
 * схемы номинации-донора. Разрешено, только если схема номинации не тронута
 * — сервер отклоняет иначе 409 (`FailedPrecondition`, FR-14). Ветка ошибки
 * несёт HTTP-статус (спека 0031, FR-27) — `useApplyFormat` переводит его в
 * русский текст через `presetErrorMessage(..., "apply")`.
 */
export async function applyFormatRequest(
  nominationId: string,
  source: ApplyFormatSource,
): Promise<ApplyFormatResult> {
  const res = await apiFetch<{ stages?: Stage[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/format`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, stages: res.data.stages ?? [] };
}

/**
 * restoreBuiltinPresetsRequest — POST /api/formats/restore: заводит записи
 * встроенного каталога, которых в библиотеке сейчас нет (спека 0047, FR-10).
 * Тело запроса пустое — действие не параметризуется. `skipped` — сколько
 * записей пропущено по занятому имени (FR-9); существующие пресеты действие
 * не трогает.
 */
export async function restoreBuiltinPresetsRequest(): Promise<RestoreBuiltinPresetsResult> {
  const res = await apiFetch<{ restored?: FormatPreset[]; skipped?: number }>(
    "/api/formats/restore",
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, restored: res.data.restored ?? [], skipped: res.data.skipped ?? 0 };
}
