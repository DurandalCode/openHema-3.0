import type { Fighter, WithdrawalReason } from "@/entities/fighter/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type FighterListResult =
  | { ok: true; fighters: Fighter[] }
  | { ok: false; error: string };

export type FighterResult = { ok: true; fighter: Fighter } | { ok: false; error: string };

/** listRosterRequest — GET /api/admin/fighters?tournamentId=... (admin). */
export async function listRosterRequest(tournamentId: string): Promise<FighterListResult> {
  const res = await apiFetch<{ fighters?: Fighter[] }>(
    `/api/admin/fighters?${new URLSearchParams({ tournamentId })}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighters: res.data.fighters ?? [] };
}

export type CreateFighterInput = {
  tournamentId: string;
  name: string;
  club?: string;
  nominationIds?: string[];
};

/** createFighterRequest — POST /api/admin/fighters (admin). */
export async function createFighterRequest(input: CreateFighterInput): Promise<FighterResult> {
  return sendFighter("/api/admin/fighters", "POST", input);
}

/** editFighterRequest — PATCH /api/admin/fighters/[id] (admin). */
export async function editFighterRequest(
  fighterId: string,
  name: string,
  club: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}`, "PATCH", { name, club });
}

/** withdrawFighterRequest — POST /api/admin/fighters/[id]/withdraw (admin). */
export async function withdrawFighterRequest(
  fighterId: string,
  reason: WithdrawalReason,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/withdraw`, "POST", { reason });
}

/** returnFighterRequest — POST /api/admin/fighters/[id]/return (admin). */
export async function returnFighterRequest(fighterId: string): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/return`, "POST");
}

/** addToNominationRequest — POST /api/admin/fighters/[id]/nominations (admin). */
export async function addToNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations`, "POST", {
    nominationId,
  });
}

/** removeFromNominationRequest — DELETE /api/admin/fighters/[id]/nominations?nominationId=... (admin). */
export async function removeFromNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  const params = new URLSearchParams({ nominationId });
  const res = await apiFetch<{ fighter?: Fighter }>(
    `/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations?${params}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}

/** moveFighterRequest — POST /api/admin/fighters/[id]/move (admin). */
export async function moveFighterRequest(
  fighterId: string,
  fromNominationId: string,
  toNominationId: string,
): Promise<FighterResult> {
  return sendFighter(`/api/admin/fighters/${encodeURIComponent(fighterId)}/move`, "POST", {
    fromNominationId,
    toNominationId,
  });
}

/**
 * findFighterByAccountRequest — GET /api/fighters/find-by-account?userId=...
 * (admin, спека 0040, FR-9). `tournamentId` опционален — пусто → активный
 * турнир. `fighter: null` в результате — учётке боец в турнире не
 * сопоставлен (не ошибка).
 */
export async function findFighterByAccountRequest(
  userId: string,
  tournamentId?: string,
): Promise<{ ok: true; fighter: Fighter | null } | { ok: false; error: string }> {
  const params = new URLSearchParams({ userId });
  if (tournamentId) params.set("tournamentId", tournamentId);
  const res = await apiFetch<{ fighter: Fighter | null }>(
    `/api/fighters/find-by-account?${params}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter };
}

/**
 * mergeFightersRequest — POST /api/fighters/merge (admin, спека 0040,
 * FR-10/FR-10a): сводит дубль `sourceFighterId` в `targetFighterId`,
 * возвращает итоговую (target) запись.
 */
export async function mergeFightersRequest(
  sourceFighterId: string,
  targetFighterId: string,
): Promise<FighterResult> {
  const res = await apiFetch<{ fighter?: Fighter }>("/api/fighters/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceFighterId, targetFighterId }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}

async function sendFighter(
  url: string,
  method: "POST" | "PATCH",
  body?: unknown,
): Promise<FighterResult> {
  const res = await apiFetch<{ fighter?: Fighter }>(url, {
    method,
    ...(body !== undefined
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, fighter: res.data.fighter as Fighter };
}
