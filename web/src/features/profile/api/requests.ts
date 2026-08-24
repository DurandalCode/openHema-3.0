import { apiFetch } from "@/shared/api/api-fetch";
import type { CurrentUser } from "@/entities/user/lib/types";

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
