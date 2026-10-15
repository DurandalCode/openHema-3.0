import type { Pool } from "@/entities/pool/lib/types";
import type { Bout } from "@/entities/bout/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

/**
 * ArenaPoolsState — состояние страницы арены (спека 0011, FR-9; спека
 * 0063): стоящий пул, доступные для постановки и очередь арены по порядку.
 * Его же возвращают мутации очереди — клиент кладёт ответ в кэш без второго
 * запроса.
 */
export type ArenaPoolsState = { seated: Pool | null; available: Pool[]; queued: Pool[] };

export type PoolsForArenaResult = ({ ok: true } & ArenaPoolsState) | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

export type BoutsResult = { ok: true; bouts: Bout[] } | { ok: false; error: string };

/**
 * getPoolsForArenaRequest — GET /api/arenas/[id]/pools (только admin, спека
 * 0011, FR-9): пул на арене (или `null`, если свободна) + готовые к
 * постановке пулы.
 */
export async function getPoolsForArenaRequest(arenaId: string): Promise<PoolsForArenaResult> {
  const res = await apiFetch<Partial<ArenaPoolsState>>(
    `/api/arenas/${encodeURIComponent(arenaId)}/pools`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, ...toArenaPoolsState(res.data) };
}

function toArenaPoolsState(data: Partial<ArenaPoolsState>): ArenaPoolsState {
  return { seated: data.seated ?? null, available: data.available ?? [], queued: data.queued ?? [] };
}

/**
 * enqueuePoolRequest — POST /api/pools/[poolId]/enqueue (только admin, спека
 * 0063, FR-3..FR-5): добавляет пул в конец очереди арены (пул из очереди
 * другой арены переносится). Возвращает состояние страницы арены.
 */
export async function enqueuePoolRequest(poolId: string, arenaId: string): Promise<PoolsForArenaResult> {
  return sendStateAction(`/api/pools/${encodeURIComponent(poolId)}/enqueue`, "POST", { arenaId });
}

/**
 * dequeuePoolRequest — POST /api/pools/[poolId]/dequeue (только admin, спека
 * 0063, FR-6): убирает пул из очереди арены.
 */
export async function dequeuePoolRequest(poolId: string): Promise<PoolsForArenaResult> {
  return sendStateAction(`/api/pools/${encodeURIComponent(poolId)}/dequeue`, "POST");
}

/**
 * reorderArenaQueueRequest — PUT /api/arenas/[id]/queue (только admin, спека
 * 0063, FR-6): задаёт порядок очереди целиком (полный упорядоченный список
 * id; устаревший набор сервер отклоняет).
 */
export async function reorderArenaQueueRequest(
  arenaId: string,
  poolIds: string[],
): Promise<PoolsForArenaResult> {
  return sendStateAction(`/api/arenas/${encodeURIComponent(arenaId)}/queue`, "PUT", { poolIds });
}

/**
 * seatNextPoolRequest — POST /api/arenas/[id]/seat-next (только admin, спека
 * 0063, FR-9): ставит первый пул очереди на свободную арену.
 */
export async function seatNextPoolRequest(arenaId: string): Promise<PoolsForArenaResult> {
  return sendStateAction(`/api/arenas/${encodeURIComponent(arenaId)}/seat-next`, "POST");
}

/**
 * seatPoolRequest — POST /api/pools/[poolId]/seat (только admin, FR-7):
 * ставит готовый пул на арену целиком, вместе с боями.
 */
export async function seatPoolRequest(poolId: string, arenaId: string): Promise<ActionResult> {
  return sendAction(`/api/pools/${encodeURIComponent(poolId)}/seat`, "POST", { arenaId });
}

/**
 * unseatPoolRequest — POST /api/pools/[poolId]/unseat (только admin, FR-8):
 * снимает пул с арены, площадка освобождается.
 */
export async function unseatPoolRequest(poolId: string): Promise<ActionResult> {
  return sendAction(`/api/pools/${encodeURIComponent(poolId)}/unseat`, "POST");
}

/**
 * getBoutsForNominationRequest — GET /api/nominations/[id]/bouts (только
 * admin, спека 0010): бои пула на арене, чтобы показать их по порядку
 * рядом с постановкой (спека 0011, FR-9). Переиспользует существующую BFF
 * ручку (не дублирует её под фичей — общий эндпоинт, не собственность
 * nomination-pools).
 */
export async function getBoutsForNominationRequest(nominationId: string): Promise<BoutsResult> {
  const res = await apiFetch<{ bouts?: Bout[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/bouts`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, bouts: res.data.bouts ?? [] };
}

async function sendAction(
  url: string,
  method: "POST",
  body?: unknown,
): Promise<ActionResult> {
  const res = await apiFetch<unknown>(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

async function sendStateAction(
  url: string,
  method: "POST" | "PUT",
  body?: unknown,
): Promise<PoolsForArenaResult> {
  const res = await apiFetch<Partial<ArenaPoolsState>>(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, ...toArenaPoolsState(res.data) };
}
