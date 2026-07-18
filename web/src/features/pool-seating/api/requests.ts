import type { Pool } from "@/entities/pool/lib/types";
import type { Bout } from "@/entities/bout/lib/types";

export type PoolsForArenaResult =
  | { ok: true; seated: Pool | null; available: Pool[] }
  | { ok: false; error: string };

export type ActionResult = { ok: true } | { ok: false; error: string };

export type BoutsResult = { ok: true; bouts: Bout[] } | { ok: false; error: string };

/**
 * getPoolsForArenaRequest — GET /api/arenas/[id]/pools (только admin, спека
 * 0011, FR-9): пул на арене (или `null`, если свободна) + готовые к
 * постановке пулы.
 */
export async function getPoolsForArenaRequest(arenaId: string): Promise<PoolsForArenaResult> {
  try {
    const res = await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/pools`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as {
      seated?: Pool | null;
      available?: Pool[];
    };
    return { ok: true, seated: data.seated ?? null, available: data.available ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
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
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/bouts`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { bouts?: Bout[] };
    return { ok: true, bouts: data.bouts ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

async function sendAction(
  url: string,
  method: "POST",
  body?: unknown,
): Promise<ActionResult> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
