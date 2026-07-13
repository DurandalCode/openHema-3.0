import type { Arena } from "@/entities/arena/lib/types";

export type ArenaInput = {
  name: string;
  description?: string;
};

export type ArenaResult =
  | { ok: true; arena: Arena }
  | { ok: false; error: string };

export type ArenaListResult =
  | { ok: true; arenas: Arena[] }
  | { ok: false; error: string };

/** listArenasRequest — GET /api/admin/arenas?tournamentId=... (только admin). */
export async function listArenasRequest(tournamentId: string): Promise<ArenaListResult> {
  try {
    const res = await fetch(`/api/admin/arenas?tournamentId=${encodeURIComponent(tournamentId)}`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { arenas?: Arena[] };
    return { ok: true, arenas: data.arenas ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** getArenaRequest — GET /api/admin/arenas/[id] (только admin). */
export async function getArenaRequest(id: string): Promise<ArenaResult> {
  try {
    const res = await fetch(`/api/admin/arenas/${encodeURIComponent(id)}`, { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { arena?: Arena };
    return { ok: true, arena: data.arena as Arena };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
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
  try {
    const res = await fetch("/api/admin/arenas/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, orderedIds }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { arenas?: Arena[] };
    return { ok: true, arenas: data.arenas ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

async function sendArena(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<ArenaResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { arena?: Arena };
    return { ok: true, arena: data.arena as Arena };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

async function sendArenaAction(url: string): Promise<ArenaResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { arena?: Arena };
    return { ok: true, arena: data.arena as Arena };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}