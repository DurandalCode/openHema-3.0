import type { Fighter, WithdrawalReason } from "@/entities/fighter/lib/types";

export type FighterListResult =
  | { ok: true; fighters: Fighter[] }
  | { ok: false; error: string };

export type FighterResult = { ok: true; fighter: Fighter } | { ok: false; error: string };

/** listRosterRequest — GET /api/admin/fighters?tournamentId=... (admin). */
export async function listRosterRequest(tournamentId: string): Promise<FighterListResult> {
  try {
    const res = await fetch(`/api/admin/fighters?${new URLSearchParams({ tournamentId })}`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighters?: Fighter[] };
    return { ok: true, fighters: data.fighters ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

export type CreateFighterInput = {
  tournamentId: string;
  name: string;
  club?: string;
  nominationIds?: string[];
};

/** createFighterRequest — POST /api/admin/fighters (admin). */
export async function createFighterRequest(input: CreateFighterInput): Promise<FighterResult> {
  try {
    const res = await fetch("/api/admin/fighters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** editFighterRequest — PATCH /api/admin/fighters/[id] (admin). */
export async function editFighterRequest(
  fighterId: string,
  name: string,
  club: string,
): Promise<FighterResult> {
  try {
    const res = await fetch(`/api/admin/fighters/${encodeURIComponent(fighterId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, club }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** withdrawFighterRequest — POST /api/admin/fighters/[id]/withdraw (admin). */
export async function withdrawFighterRequest(
  fighterId: string,
  reason: WithdrawalReason,
): Promise<FighterResult> {
  try {
    const res = await fetch(`/api/admin/fighters/${encodeURIComponent(fighterId)}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** returnFighterRequest — POST /api/admin/fighters/[id]/return (admin). */
export async function returnFighterRequest(fighterId: string): Promise<FighterResult> {
  try {
    const res = await fetch(`/api/admin/fighters/${encodeURIComponent(fighterId)}/return`, {
      method: "POST",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** addToNominationRequest — POST /api/admin/fighters/[id]/nominations (admin). */
export async function addToNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  try {
    const res = await fetch(`/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nominationId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** removeFromNominationRequest — DELETE /api/admin/fighters/[id]/nominations?nominationId=... (admin). */
export async function removeFromNominationRequest(
  fighterId: string,
  nominationId: string,
): Promise<FighterResult> {
  try {
    const params = new URLSearchParams({ nominationId });
    const res = await fetch(
      `/api/admin/fighters/${encodeURIComponent(fighterId)}/nominations?${params}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** moveFighterRequest — POST /api/admin/fighters/[id]/move (admin). */
export async function moveFighterRequest(
  fighterId: string,
  fromNominationId: string,
  toNominationId: string,
): Promise<FighterResult> {
  try {
    const res = await fetch(`/api/admin/fighters/${encodeURIComponent(fighterId)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromNominationId, toNominationId }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { fighter?: Fighter };
    return { ok: true, fighter: data.fighter as Fighter };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
