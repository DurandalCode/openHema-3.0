import { apiFetch } from "@/shared/api/api-fetch";
import type { CurrentUser, NotificationSettings, Session } from "@/entities/user/lib/types";

export type UpdateProfileInput = {
  displayName: string;
  club: string;
};

export type UpdateProfileResult = { ok: true; user: CurrentUser } | { ok: false; error: string };

/**
 * updateProfileRequest — PATCH /api/auth/profile (спека 0038, FR-23).
 * Переведён на `apiFetch` (спека 0039, T7): 401 бросает `UnauthorizedError`
 * так же, как раньше делал локальный `ensureAuthorized` — сессия умерла
 * посреди правки профиля поднимает «Сессия истекла»
 * (`shared/lib/query-client.ts`, глобальный `MutationCache.onError`), а не
 * общий текст ошибки под полем.
 */
export async function updateProfileRequest(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  const res = await apiFetch<{ user: CurrentUser }>("/api/auth/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user };
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * changePasswordRequest — POST /api/auth/password (спека 0038, FR-24).
 * Та же `apiFetch`-семантика, что у `updateProfileRequest`.
 */
export async function changePasswordRequest(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const res = await apiFetch<unknown>("/api/auth/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export type UserResult = { ok: true; user: CurrentUser } | { ok: false; error: string };
export type OkResult = { ok: true } | { ok: false; error: string };

/**
 * verifyEmailRequest — POST /api/auth/email/verify (спека 0042, FR-3).
 * Публичный BFF-роут (переход по ссылке из письма может случиться без
 * сессии этого браузера) — но фетчер всё равно проходит через `apiFetch`
 * для единой обработки сети/ошибок.
 */
export async function verifyEmailRequest(token: string): Promise<OkResult> {
  const res = await apiFetch<unknown>("/api/auth/email/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/**
 * resendEmailVerificationRequest — POST /api/auth/email/resend (FR-4).
 * Троттлинг (429) приходит как обычная ошибка `apiFetch` — `res.error`
 * несёт серверное сообщение, UI показывает его тостом без локального
 * таймера.
 */
export async function resendEmailVerificationRequest(): Promise<OkResult> {
  const res = await apiFetch<unknown>("/api/auth/email/resend", { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/** requestEmailChangeRequest — POST /api/auth/email/change (FR-6/FR-8). */
export async function requestEmailChangeRequest(
  newEmail: string,
  currentPassword: string,
): Promise<UserResult> {
  const res = await apiFetch<{ user: CurrentUser }>("/api/auth/email/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newEmail, currentPassword }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user };
}

/** cancelEmailChangeRequest — DELETE /api/auth/email/change (FR-6). */
export async function cancelEmailChangeRequest(): Promise<UserResult> {
  const res = await apiFetch<{ user: CurrentUser }>("/api/auth/email/change", {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user };
}

/**
 * confirmEmailChangeRequest — POST /api/auth/email/change/confirm (FR-6).
 * Публичный BFF-роут, как `verifyEmailRequest`.
 */
export async function confirmEmailChangeRequest(token: string): Promise<UserResult> {
  const res = await apiFetch<{ user: CurrentUser }>("/api/auth/email/change/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user };
}

export type ListSessionsResult =
  | { ok: true; sessions: Session[] }
  | { ok: false; error: string };

/** listSessionsRequest — GET /api/auth/sessions (FR-11). */
export async function listSessionsRequest(): Promise<ListSessionsResult> {
  const res = await apiFetch<{ sessions: Session[] }>("/api/auth/sessions");
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, sessions: res.data.sessions };
}

/** revokeSessionRequest — DELETE /api/auth/sessions/[id] (FR-12). */
export async function revokeSessionRequest(id: string): Promise<OkResult> {
  const res = await apiFetch<unknown>(`/api/auth/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

export type RevokeOtherSessionsResult =
  | { ok: true; revokedCount: number }
  | { ok: false; error: string };

/**
 * revokeOtherSessionsRequest — DELETE /api/auth/sessions — «выйти со всех
 * устройств» (FR-12).
 */
export async function revokeOtherSessionsRequest(): Promise<RevokeOtherSessionsResult> {
  const res = await apiFetch<{ revokedCount: number }>("/api/auth/sessions", {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, revokedCount: res.data.revokedCount };
}

/**
 * updateNotificationSettingsRequest — PUT /api/auth/notifications
 * (FR-20/FR-21). Включение при неподтверждённом адресе отклоняется
 * сервером (409) — `res.error` несёт объяснение.
 */
export async function updateNotificationSettingsRequest(
  settings: NotificationSettings,
): Promise<UserResult> {
  const res = await apiFetch<{ user: CurrentUser }>("/api/auth/notifications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user };
}
