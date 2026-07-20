import type { BoutBoard } from "@/entities/pool/lib/types";

export type BoardResult = { ok: true; board: BoutBoard | null } | { ok: false; error: string };

/**
 * getBoutBoardRequest — GET /api/arenas/[id]/board (только admin, спека
 * 0013, FR-14): доска ведения боёв арены (стоящий пул, бои по порядку,
 * текущий бой). `board` — `null`, если на арене никто не стоит.
 */
export async function getBoutBoardRequest(arenaId: string): Promise<BoardResult> {
  try {
    const res = await fetch(`/api/arenas/${encodeURIComponent(arenaId)}/board`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { board?: BoutBoard | null };
    return { ok: true, board: data.board ?? null };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/**
 * setCurrentBoutRequest — PUT /api/pools/[poolId]/current-bout (только
 * admin, FR-8): циркуляция — назначить текущим любой бой пула, включая уже
 * завершённый.
 */
export async function setCurrentBoutRequest(poolId: string, boutId: string): Promise<BoardResult> {
  return sendJson(`/api/pools/${encodeURIComponent(poolId)}/current-bout`, "PUT", { boutId });
}

/** startBoutRequest — начать текущий бой пула (FR-4). */
export async function startBoutRequest(poolId: string): Promise<BoardResult> {
  return sendBoutAction(poolId, { action: "start" });
}

/**
 * scoreBoutRequest — задать абсолютный счёт текущего боя (FR-2/FR-2a):
 * быстрые шаги ±1/±2/±3/±5 и ручной ввод считаются на клиенте
 * (`model/score-step.ts`), сюда шлётся только итоговое значение.
 */
export async function scoreBoutRequest(
  poolId: string,
  scoreA: number,
  scoreB: number,
): Promise<BoardResult> {
  return sendBoutAction(poolId, { action: "score", scoreA, scoreB });
}

/** finishBoutRequest — завершить текущий бой пула, фиксируя счёт (FR-5). */
export async function finishBoutRequest(poolId: string): Promise<BoardResult> {
  return sendBoutAction(poolId, { action: "finish" });
}

/** reopenBoutRequest — переоткрыть завершённый бой для правки счёта (FR-6). */
export async function reopenBoutRequest(poolId: string): Promise<BoardResult> {
  return sendBoutAction(poolId, { action: "reopen" });
}

/** resetBoutRequest — сбросить начатый бой в «не начат» (FR-6). */
export async function resetBoutRequest(poolId: string): Promise<BoardResult> {
  return sendBoutAction(poolId, { action: "reset" });
}

async function sendBoutAction(poolId: string, body: unknown): Promise<BoardResult> {
  return sendJson(`/api/pools/${encodeURIComponent(poolId)}/bout`, "POST", body);
}

async function sendJson(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<BoardResult> {
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
    const data = (await res.json().catch(() => ({}))) as { board?: BoutBoard | null };
    return { ok: true, board: data.board ?? null };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
