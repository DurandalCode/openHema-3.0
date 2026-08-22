import type { ContactType, Tournament } from "@/entities/tournament/lib/types";

export type ContactInput = { type: ContactType; value: string };

export type UpdateTournamentInput = {
  title: string;
  description?: string;
  emblemUrl?: string;
  // eventStartAt — ISO-строка или null (дата начала не задана).
  eventStartAt?: string | null;
  // eventEndAt — ISO-строка или null (однодневный/без даты окончания).
  // Если задано, eventStartAt обязательно и end >= start (валидируется на сервере).
  eventEndAt?: string | null;
  contacts?: ContactInput[];
  // Профиль турнира — новые поля (spec 0037, FR-18). UpdateActiveTournament
  // заменяет профиль целиком (FR-22) — не передать поле здесь означает
  // обнулить его на сервере при следующем сохранении.
  chiefJudge?: string;
  regulationsUrl?: string;
  venueName?: string;
  venueAddress?: string;
  // entryFeeMinor — взнос в минорных единицах (копейки); null — не задан
  // (FR-21, отличимо от явного 0).
  entryFeeMinor?: number | null;
  entryFeeCurrency?: string;
};

export type TournamentResult =
  | { ok: true; tournament: Tournament }
  | { ok: false; error: string; status: number };

/** getActiveTournamentRequest — GET /api/tournament (публичный). */
export async function getActiveTournamentRequest(): Promise<TournamentResult> {
  return getTournament("/api/tournament");
}

/** updateTournamentRequest — PUT /api/tournament (только admin). */
export async function updateTournamentRequest(
  input: UpdateTournamentInput,
): Promise<TournamentResult> {
  return putTournament("/api/tournament", input);
}

async function getTournament(url: string): Promise<TournamentResult> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса", status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as {
      tournament?: Tournament;
    };
    return { ok: true, tournament: data.tournament as Tournament };
  } catch {
    return { ok: false, error: "Сеть недоступна", status: 0 };
  }
}

async function putTournament(
  url: string,
  body: UpdateTournamentInput,
): Promise<TournamentResult> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса", status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as {
      tournament?: Tournament;
    };
    return { ok: true, tournament: data.tournament as Tournament };
  } catch {
    return { ok: false, error: "Сеть недоступна", status: 0 };
  }
}