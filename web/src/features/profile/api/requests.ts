import { ensureAuthorized } from "@/shared/api/unauthorized";
import type { CurrentUser } from "@/entities/user/lib/types";

export type UpdateProfileInput = {
  displayName: string;
  club: string;
};

export type UpdateProfileResult = { ok: true; user: CurrentUser } | { ok: false; error: string };

/**
 * updateProfileRequest — PATCH /api/auth/profile (спека 0038, FR-23).
 * `ensureAuthorized` бросает `UnauthorizedError` на 401 — сессия умерла
 * посреди правки профиля поднимает «Сессия истекла»
 * (`shared/lib/query-client.ts`, глобальный `MutationCache.onError`), а не
 * общий текст ошибки под полем.
 */
export async function updateProfileRequest(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }

  ensureAuthorized(res);

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Ошибка запроса" };
  }

  const data = (await res.json()) as { user: CurrentUser };
  return { ok: true, user: data.user };
}

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/**
 * changePasswordRequest — POST /api/auth/password (спека 0038, FR-24).
 * Та же `ensureAuthorized`-семантика, что у `updateProfileRequest`.
 */
export async function changePasswordRequest(
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }

  ensureAuthorized(res);

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Ошибка запроса" };
  }

  return { ok: true };
}
