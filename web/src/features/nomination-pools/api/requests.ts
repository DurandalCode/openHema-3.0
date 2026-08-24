import type { PoolLayout } from "@/entities/pool/lib/types";
import type { Bout } from "@/entities/bout/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type PoolLayoutResult =
  | { ok: true; layout: PoolLayout }
  | { ok: false; error: string; status?: number };

export type BoutsResult =
  | { ok: true; bouts: Bout[] }
  | { ok: false; error: string };

/**
 * getLayoutRequest — GET /api/stages/[stageId]/layout (только admin).
 *
 * Спека 0018, FR-18: адресация раскладки переехала с номинации на этап
 * (`stage_id`), чтобы у номинации могло быть несколько этапов (группы +
 * сетка). Поведение групповой раскладки не меняется (FR-23) — только путь.
 */
export async function getLayoutRequest(stageId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/layout`, {
    method: "GET",
  });
}

/** createPoolRequest — POST /api/stages/[stageId]/pools (только admin, draft). */
export async function createPoolRequest(stageId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/pools`, {
    method: "POST",
  });
}

/** deletePoolRequest — DELETE /api/pools/[poolId] (только admin, draft, undoable). Адресуется своим id, не этапом. */
export async function deletePoolRequest(poolId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/pools/${encodeURIComponent(poolId)}`, { method: "DELETE" });
}

/** resetLayoutRequest — POST /api/stages/[stageId]/reset (только admin, draft). */
export async function resetLayoutRequest(stageId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/reset`, { method: "POST" });
}

/** assignFighterRequest — POST /api/stages/[stageId]/assign (DnD: в пул/move). */
export async function assignFighterRequest(
  stageId: string,
  fighterId: string,
  poolId: string,
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighterId, poolId }),
  });
}

/** unassignFighterRequest — POST /api/stages/[stageId]/unassign (DnD: в нераспределённые). */
export async function unassignFighterRequest(
  stageId: string,
  fighterId: string,
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/unassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighterId }),
  });
}

/** autoDistributeRequest — POST /api/stages/[stageId]/distribute («Распределить по группам»). */
export async function autoDistributeRequest(stageId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/distribute`, {
    method: "POST",
  });
}

/** undoRequest — POST /api/stages/[stageId]/undo («Отменить»). */
export async function undoRequest(stageId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/undo`, {
    method: "POST",
  });
}

/** setLayoutStatusRequest — POST /api/stages/[stageId]/status (draft↔ready). */
export async function setLayoutStatusRequest(
  stageId: string,
  status: "draft" | "ready",
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/stages/${encodeURIComponent(stageId)}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/**
 * fetchBouts — GET /api/nominations/[id]/bouts (только admin; бои видны
 * только когда раскладка пулов в ready, спека 0010, AC-5). Остаётся
 * адресован номинацией — этой ручки трек 0018 не переносит (план,
 * «BFF»: список меняемых путей ограничен раскладкой/сеткой), бои видны сразу
 * по всем этапам номинации.
 */
export async function fetchBouts(nominationId: string): Promise<BoutsResult> {
  const res = await apiFetch<{ bouts?: Bout[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/bouts`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, bouts: res.data.bouts ?? [] };
}

async function fetchLayout(url: string, init: RequestInit): Promise<PoolLayoutResult> {
  const res = await apiFetch<{ layout?: PoolLayout }>(url, init);
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, layout: res.data.layout as PoolLayout };
}
