import type { Arena } from "@/entities/arena/lib/types";
import type { BoutBoard } from "@/entities/pool/lib/types";
import type { ArenaIdleState } from "@/entities/tournament-console/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type ArenaInput = {
  name: string;
  description?: string;
};

export type ArenaResult =
  | { ok: true; arena: Arena }
  | { ok: false; error: string };

export type ArenaListResult =
  | { ok: true; arenas: Arena[] }
  | { ok: false; error: string; status?: number };

export type ArenaBoardResult =
  | { ok: true; board: BoutBoard | null }
  | { ok: false; error: string };

/**
 * ArenaBoardEntry — доска одной площадки в составе GetArenaBoards (спека
 * 0041), обогащённая простоем (спека 0043, FR-26/FR-28): `idleState`/
 * `freeSince` — см. `entities/tournament-console/lib/types.ArenaIdleState`
 * (тот же тип, что несёт пульт — единая ось для обоих экранов).
 */
export type ArenaBoardEntry = {
  arenaId: string;
  board: BoutBoard | null;
  idleState: ArenaIdleState;
  freeSince: string | null;
};

export type ArenaBoardsResult =
  | { ok: true; entries: ArenaBoardEntry[] }
  | { ok: false; error: string };

/** listArenasRequest — GET /api/admin/arenas?tournamentId=... (только admin). */
export async function listArenasRequest(tournamentId: string): Promise<ArenaListResult> {
  const res = await apiFetch<{ arenas?: Arena[] }>(
    `/api/admin/arenas?tournamentId=${encodeURIComponent(tournamentId)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, arenas: res.data.arenas ?? [] };
}

/** getArenaRequest — GET /api/admin/arenas/[id] (только admin). */
export async function getArenaRequest(id: string): Promise<ArenaResult> {
  const res = await apiFetch<{ arena?: Arena }>(`/api/admin/arenas/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, arena: res.data.arena as Arena };
}

/** createArenaRequest — POST /api/admin/arenas (только admin). */
export async function createArenaRequest(
  tournamentId: string,
  input: ArenaInput,
): Promise<ArenaResult> {
  return sendArena("/api/admin/arenas", "POST", { tournamentId, ...input });
}

/** updateArenaRequest — PATCH /api/admin/arenas/[id] (только admin). */
export async function updateArenaRequest(
  id: string,
  input: ArenaInput,
): Promise<ArenaResult> {
  return sendArena(`/api/admin/arenas/${encodeURIComponent(id)}`, "PATCH", input);
}

/** archiveArenaRequest — POST /api/admin/arenas/[id]/archive (только admin). */
export async function archiveArenaRequest(id: string): Promise<ArenaResult> {
  return sendArenaAction(`/api/admin/arenas/${encodeURIComponent(id)}/archive`);
}

/** restoreArenaRequest — POST /api/admin/arenas/[id]/restore (только admin). */
export async function restoreArenaRequest(id: string): Promise<ArenaResult> {
  return sendArenaAction(`/api/admin/arenas/${encodeURIComponent(id)}/restore`);
}

/** reorderArenasRequest — POST /api/admin/arenas/reorder (только admin). */
export async function reorderArenasRequest(
  tournamentId: string,
  orderedIds: string[],
): Promise<ArenaListResult> {
  const res = await apiFetch<{ arenas?: Arena[] }>("/api/admin/arenas/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tournamentId, orderedIds }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, arenas: res.data.arenas ?? [] };
}

/**
 * getArenaBoardRequest — GET /api/arenas/[id]/board (только admin, спека
 * 0013, FR-14): доска ведения боёв арены, источник живого статуса строки
 * списка (спека 0027, FR-3). `board` — `null`, если на арене никто не
 * стоит. Свой fetcher, а не импорт из `features/bout-board` — `features`
 * не импортят друг друга (`web/AGENTS.md`, п.6).
 */
export async function getArenaBoardRequest(arenaId: string): Promise<ArenaBoardResult> {
  const res = await apiFetch<{ board?: BoutBoard | null }>(
    `/api/arenas/${encodeURIComponent(arenaId)}/board`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, board: res.data.board ?? null };
}

/**
 * getArenaBoardsRequest — GET /api/tournaments/[id]/arena-boards (только
 * admin, спека 0041, FR-7/FR-9): доска ведения боёв каждой неархивной
 * площадки турнира за одно обращение — заменяет N вызовов
 * `getArenaBoardRequest` за цикл обновления одним агрегирующим запросом
 * (источник `useArenaBoards`).
 */
export async function getArenaBoardsRequest(tournamentId: string): Promise<ArenaBoardsResult> {
  const res = await apiFetch<{ entries?: ArenaBoardEntry[] }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/arena-boards`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, entries: res.data.entries ?? [] };
}

/**
 * setArenaDefaultDurationRequest — PUT /api/admin/arenas/[id]/default-duration
 * (только admin, спека 0015/0027 FR-12): дефолтная длительность боя площадки
 * в секундах.
 */
export async function setArenaDefaultDurationRequest(
  id: string,
  seconds: number,
): Promise<ArenaResult> {
  return sendArena(`/api/admin/arenas/${encodeURIComponent(id)}/default-duration`, "PUT", {
    defaultDurationSeconds: seconds,
  });
}

async function sendArena(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
): Promise<ArenaResult> {
  const res = await apiFetch<{ arena?: Arena }>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, arena: res.data.arena as Arena };
}

async function sendArenaAction(url: string): Promise<ArenaResult> {
  const res = await apiFetch<{ arena?: Arena }>(url, { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, arena: res.data.arena as Arena };
}
