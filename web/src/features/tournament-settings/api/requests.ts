import type {
  ContactType,
  NotificationSettings,
  Tournament,
  TournamentProgramDay,
} from "@/entities/tournament/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

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
  // program — программа турнира по дням (спека 0040, FR-14): полная замена,
  // тем же приёмом, что contacts (не передать поле — обнулить его на сервере
  // при следующем сохранении).
  program?: TournamentProgramDay[];
  // notifications — глобальные переключатели уведомлений турнира (спека
  // 0042, FR-19): сохраняются вместе со всем профилем, той же
  // full-replace семантикой, что остальные поля выше.
  notifications?: NotificationSettings;
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
  const res = await apiFetch<{ tournament?: Tournament }>(url, { method: "GET" });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 0 };
  return { ok: true, tournament: res.data.tournament as Tournament };
}

async function putTournament(
  url: string,
  body: UpdateTournamentInput,
): Promise<TournamentResult> {
  const res = await apiFetch<{ tournament?: Tournament }>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 0 };
  return { ok: true, tournament: res.data.tournament as Tournament };
}

// FileKind — вид файла профиля турнира (спека 0042, FR-30/FR-31): та же
// строка в URL, что BFF-роут `app/api/tournament/files/[kind]/route.ts`
// ожидает в динамическом сегменте.
export type FileKind = "regulations" | "emblem";

/**
 * uploadTournamentFileRequest — POST /api/tournament/files/{kind} (только
 * admin, FR-30/FR-31): загрузка файла вместо ссылки. `file` — уже прошедший
 * локальную проверку типа/размера (`file-or-link-field.tsx`) `File` из
 * `<input type="file">`; тело — `multipart/form-data`, без явного
 * `Content-Type` заголовка — браузер сам проставляет boundary.
 */
export async function uploadTournamentFileRequest(
  kind: FileKind,
  file: File,
): Promise<TournamentResult> {
  const formData = new FormData();
  formData.set("file", file);
  const res = await apiFetch<{ tournament?: Tournament }>(`/api/tournament/files/${kind}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 0 };
  return { ok: true, tournament: res.data.tournament as Tournament };
}

/** deleteTournamentFileRequest — DELETE /api/tournament/files/{kind} (только
 * admin, FR-36): освобождает загруженный файл, ссылка (если её сохранял
 * прежний источник) не восстанавливается автоматически. */
export async function deleteTournamentFileRequest(kind: FileKind): Promise<TournamentResult> {
  const res = await apiFetch<{ tournament?: Tournament }>(`/api/tournament/files/${kind}`, {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status ?? 0 };
  return { ok: true, tournament: res.data.tournament as Tournament };
}
