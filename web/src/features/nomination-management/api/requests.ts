import type { Nomination } from "@/entities/nomination/lib/types";

export type NominationInput = {
  title: string;
  description?: string;
  fighterCapacity?: number | null;
  metadata?: { rulesUrl?: string };
};

export type NominationResult =
  | { ok: true; nomination: Nomination }
  | { ok: false; error: string };

export type NominationListResult =
  | { ok: true; nominations: Nomination[] }
  | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** listNominationsRequest — GET /api/nominations?tournamentId=... (публичный). */
export async function listNominationsRequest(tournamentId: string): Promise<NominationListResult> {
  try {
    const res = await fetch(`/api/nominations?tournamentId=${encodeURIComponent(tournamentId)}`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { nominations?: Nomination[] };
    return { ok: true, nominations: data.nominations ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** createNominationRequest — POST /api/nominations (только admin). */
export async function createNominationRequest(
  tournamentId: string,
  input: NominationInput,
): Promise<NominationResult> {
  return sendNomination("/api/nominations", "POST", { tournamentId, ...input });
}

/** updateNominationRequest — PUT /api/nominations/[id] (только admin). */
export async function updateNominationRequest(
  id: string,
  input: NominationInput,
): Promise<NominationResult> {
  return sendNomination(`/api/nominations/${encodeURIComponent(id)}`, "PUT", input);
}

/** deleteNominationRequest — DELETE /api/nominations/[id] (только admin). */
export async function deleteNominationRequest(id: string): Promise<DeleteResult> {
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/** reorderNominationsRequest — POST /api/nominations/reorder (только admin). */
export async function reorderNominationsRequest(
  tournamentId: string,
  orderedIds: string[],
): Promise<NominationListResult> {
  try {
    const res = await fetch("/api/nominations/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, orderedIds }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { nominations?: Nomination[] };
    return { ok: true, nominations: data.nominations ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

async function sendNomination(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
): Promise<NominationResult> {
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
    const data = (await res.json().catch(() => ({}))) as { nomination?: Nomination };
    return { ok: true, nomination: data.nomination as Nomination };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
