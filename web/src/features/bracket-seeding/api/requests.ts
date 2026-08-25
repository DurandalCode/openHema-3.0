import type { Bracket } from "@/entities/bracket/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

/**
 * requests — фетчеры фичи `bracket-seeding` (спека 0018, FR-7..FR-11): чтение
 * сетки, ручной посев/освобождение слота, сброс/undo/фиксация посева. По
 * образцу `features/nomination-pools/api/requests.ts`.
 *
 * `resetBracketRequest`/`undoBracketRequest`/`setStatusRequest` переиспользуют
 * те же ручки, что и групповая раскладка (`/reset`, `/undo`, `/status`,
 * plan.md «BFF») — их ответ несёт `PoolLayout`-проекцию, не `Bracket`, поэтому
 * они возвращают только признак успеха: UI обновляет сетку инвалидацией
 * `useBracket`, а не телом ответа этих трёх ручек.
 */

export type BracketResult = { ok: true; bracket: Bracket } | { ok: false; error: string };

export type BracketActionResult = { ok: true } | { ok: false; error: string };

/** getBracketRequest — GET /api/stages/[stageId]/bracket (админский вид, FR-7/FR-19). */
export async function getBracketRequest(stageId: string): Promise<BracketResult> {
  return fetchBracket(`/api/stages/${encodeURIComponent(stageId)}/bracket`, { method: "GET" });
}

/**
 * seedSlotRequest — POST /api/stages/[stageId]/seed: сажает бойца в слот
 * первого круга; занятый слот — сервер меняет местами уже посеянного или
 * отклоняет посадку нового (`ErrSlotOccupied`, FR-8).
 */
export async function seedSlotRequest(
  stageId: string,
  fighterId: string,
  slot: number,
): Promise<BracketResult> {
  return fetchBracket(`/api/stages/${encodeURIComponent(stageId)}/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighterId, slot }),
  });
}

/** clearSlotRequest — DELETE /api/stages/[stageId]/seed: освобождает слот (идемпотентно, FR-8). */
export async function clearSlotRequest(stageId: string, slot: number): Promise<BracketResult> {
  return fetchBracket(`/api/stages/${encodeURIComponent(stageId)}/seed`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slot }),
  });
}

/** resetBracketRequest — POST /api/stages/[stageId]/reset (сброс посева целиком, тот же путь, что и группы). */
export async function resetBracketRequest(stageId: string): Promise<BracketActionResult> {
  return postAction(`/api/stages/${encodeURIComponent(stageId)}/reset`);
}

/** undoBracketRequest — POST /api/stages/[stageId]/undo (отменить последнее действие посева, FR-8). */
export async function undoBracketRequest(stageId: string): Promise<BracketActionResult> {
  return postAction(`/api/stages/${encodeURIComponent(stageId)}/undo`);
}

/** setStatusRequest — POST /api/stages/[stageId]/status (фиксация/расфиксация посева, FR-10/FR-11). */
export async function setStatusRequest(
  stageId: string,
  status: "draft" | "ready",
): Promise<BracketActionResult> {
  return postAction(`/api/stages/${encodeURIComponent(stageId)}/status`, { status });
}

async function fetchBracket(url: string, init: RequestInit): Promise<BracketResult> {
  const res = await apiFetch<{ bracket?: Bracket }>(url, init);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, bracket: res.data.bracket as Bracket };
}

async function postAction(url: string, body?: unknown): Promise<BracketActionResult> {
  const res = await apiFetch<unknown>(url, {
    method: "POST",
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}
