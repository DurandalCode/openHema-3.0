import type { PoolLayout } from "@/entities/pool/lib/types";

export type PoolLayoutResult =
  | { ok: true; layout: PoolLayout }
  | { ok: false; error: string };

/** getLayoutRequest — GET /api/nominations/[id]/pool-layout (только admin). */
export async function getLayoutRequest(nominationId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pool-layout`, {
    method: "GET",
  });
}

/** createPoolRequest — POST /api/nominations/[id]/pools (только admin, draft). */
export async function createPoolRequest(nominationId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pools`, {
    method: "POST",
  });
}

/** deletePoolRequest — DELETE /api/pools/[poolId] (только admin, draft, undoable). */
export async function deletePoolRequest(poolId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/pools/${encodeURIComponent(poolId)}`, { method: "DELETE" });
}

/** resetLayoutRequest — POST /api/nominations/[id]/pool-layout/reset (только admin, draft). */
export async function resetLayoutRequest(nominationId: string): Promise<PoolLayoutResult> {
  return fetchLayout(
    `/api/nominations/${encodeURIComponent(nominationId)}/pool-layout/reset`,
    { method: "POST" },
  );
}

/** assignFighterRequest — POST /api/nominations/[id]/pool-assign (DnD: в пул/move). */
export async function assignFighterRequest(
  nominationId: string,
  fighterId: string,
  poolId: string,
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pool-assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighterId, poolId }),
  });
}

/** unassignFighterRequest — POST /api/nominations/[id]/pool-unassign (DnD: в нераспределённые). */
export async function unassignFighterRequest(
  nominationId: string,
  fighterId: string,
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pool-unassign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fighterId }),
  });
}

/** autoDistributeRequest — POST /api/nominations/[id]/pool-distribute («Распределить по группам»). */
export async function autoDistributeRequest(nominationId: string): Promise<PoolLayoutResult> {
  return fetchLayout(
    `/api/nominations/${encodeURIComponent(nominationId)}/pool-distribute`,
    { method: "POST" },
  );
}

/** undoRequest — POST /api/nominations/[id]/pool-undo («Отменить»). */
export async function undoRequest(nominationId: string): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pool-undo`, {
    method: "POST",
  });
}

/** setLayoutStatusRequest — POST /api/nominations/[id]/pool-status (draft↔ready). */
export async function setLayoutStatusRequest(
  nominationId: string,
  status: "draft" | "ready",
): Promise<PoolLayoutResult> {
  return fetchLayout(`/api/nominations/${encodeURIComponent(nominationId)}/pool-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

async function fetchLayout(url: string, init: RequestInit): Promise<PoolLayoutResult> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { layout?: PoolLayout };
    return { ok: true, layout: data.layout as PoolLayout };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
