import type { Nomination } from "@/entities/nomination/lib/types";
import type { SchemaIssue, Stage } from "@/entities/stage/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

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
  const res = await apiFetch<{ stages?: Stage[]; issues?: SchemaIssue[] }>(
    `/api/nominations/${encodeURIComponent(nominationId)}/stages`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, stages: res.data.stages ?? [], issues: res.data.issues ?? [] };
}

export type NominationSchemaEntryDto = {
  nominationId: string;
  stages: Stage[];
  issues: SchemaIssue[];
};

export type NominationSchemasResult =
  | { ok: true; entries: NominationSchemaEntryDto[] }
  | { ok: false; error: string };

/**
 * listNominationSchemasRequest — GET /api/tournaments/[id]/nomination-schemas
 * (только admin, спека 0041, FR-8/FR-10): сводка схемы всех номинаций
 * турнира одним обращением вместо одного `listNominationStagesRequest` на
 * каждую номинацию (0028, NFR-2 — отложено, теперь реализовано).
 */
export async function listNominationSchemasRequest(
  tournamentId: string,
): Promise<NominationSchemasResult> {
  const res = await apiFetch<{ entries?: NominationSchemaEntryDto[] }>(
    `/api/tournaments/${encodeURIComponent(tournamentId)}/nomination-schemas`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, entries: res.data.entries ?? [] };
}

/** getNominationRequest — GET /api/nominations/[id] (публичный). */
export async function getNominationRequest(id: string): Promise<NominationResult> {
  const res = await apiFetch<{ nomination?: Nomination }>(
    `/api/nominations/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, nomination: res.data.nomination as Nomination };
}

/** listNominationsRequest — GET /api/nominations?tournamentId=... (публичный). */
export async function listNominationsRequest(tournamentId: string): Promise<NominationListResult> {
  const res = await apiFetch<{ nominations?: Nomination[] }>(
    `/api/nominations?tournamentId=${encodeURIComponent(tournamentId)}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, nominations: res.data.nominations ?? [] };
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
  const res = await apiFetch<unknown>(`/api/nominations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/** reorderNominationsRequest — POST /api/nominations/reorder (только admin). */
export async function reorderNominationsRequest(
  tournamentId: string,
  orderedIds: string[],
): Promise<NominationListResult> {
  const res = await apiFetch<{ nominations?: Nomination[] }>("/api/nominations/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tournamentId, orderedIds }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, nominations: res.data.nominations ?? [] };
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
  const res = await apiFetch<{ nomination?: Nomination }>(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, nomination: res.data.nomination as Nomination };
}

/**
 * postNominationAction — POST без тела (close/reopen-registration).
 * В ветке отказа прокидывает HTTP-статус (спека 0028, T4): на 409
 * `ReopenRegistration` от сервера (`FailedPrecondition`) строится русское
 * объяснение (`registrationErrorMessage`), а не показывается техническая
 * строка сервера.
 */
async function postNominationAction(url: string): Promise<NominationResult> {
  const res = await apiFetch<{ nomination?: Nomination }>(url, { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, nomination: res.data.nomination as Nomination };
}
