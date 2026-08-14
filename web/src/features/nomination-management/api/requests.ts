import type { Nomination } from "@/entities/nomination/lib/types";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";

export type NominationInput = {
  title: string;
  description?: string;
  fighterCapacity?: number | null;
  metadata?: { rulesUrl?: string };
};

export type NominationResult =
  | { ok: true; nomination: Nomination }
  | { ok: false; error: string; status?: number };

export type NominationListResult =
  | { ok: true; nominations: Nomination[] }
  | { ok: false; error: string };

export type DeleteResult = { ok: true } | { ok: false; error: string };

export type NominationStagesResult =
  | { ok: true; stages: Stage[]; issues: SchemaIssue[] }
  | { ok: false; error: string };

/** listNominationStagesRequest — GET /api/nominations/[id]/stages (только admin). */
export async function listNominationStagesRequest(
  nominationId: string,
): Promise<NominationStagesResult> {
  try {
    const res = await fetch(`/api/nominations/${encodeURIComponent(nominationId)}/stages`, {
      method: "GET",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { stages?: Stage[]; issues?: SchemaIssue[] };
    return { ok: true, stages: data.stages ?? [], issues: data.issues ?? [] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

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

/**
 * closeRegistrationRequest — POST /api/nominations/[id]/close-registration
 * (только admin, спека 0012, FR-3). Вручную закрывает приём заявок.
 */
export async function closeRegistrationRequest(id: string): Promise<NominationResult> {
  return postNominationAction(`/api/nominations/${encodeURIComponent(id)}/close-registration`);
}

/**
 * reopenRegistrationRequest — POST /api/nominations/[id]/reopen-registration
 * (только admin, спека 0012, FR-3/FR-4). Сервер отклоняет `FailedPrecondition`
 * (→ 409), если закрытие было не ручным или раскладка сейчас активна
 * (AC-9/AC-16).
 */
export async function reopenRegistrationRequest(id: string): Promise<NominationResult> {
  return postNominationAction(`/api/nominations/${encodeURIComponent(id)}/reopen-registration`);
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

/**
 * postNominationAction — POST без тела (close/reopen-registration).
 * В ветке отказа прокидывает HTTP-статус (спека 0028, T4): на 409
 * `ReopenRegistration` от сервера (`FailedPrecondition`) строится русское
 * объяснение (`registrationErrorMessage`), а не показывается техническая
 * строка сервера.
 */
async function postNominationAction(url: string): Promise<NominationResult> {
  try {
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса", status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as { nomination?: Nomination };
    return { ok: true, nomination: data.nomination as Nomination };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
