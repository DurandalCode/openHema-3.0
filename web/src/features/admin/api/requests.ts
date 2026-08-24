import type { Role } from "@/entities/user/lib/types";
import { apiFetch } from "@/shared/api/api-fetch";

export type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
};

export type CreateAdminInput = {
  email: string;
  password: string;
  displayName: string;
};

export type AdminResult =
  | { ok: true; user: AdminUser }
  | { ok: false; error: string };

export type ListResult =
  | { ok: true; users: AdminUser[] }
  | { ok: false; error: string; status?: number };

export type ActionResult =
  | { ok: true; user: AdminUser }
  | { ok: false; error: string };

/**
 * DEFAULT_LIST_LIMIT — экран запрашивает список одним вызовом с явным
 * большим лимитом вместо серверной постраничности (plan.md §«Контракты»):
 * фильтрация/поиск/страницы — клиентские, на уже загруженном массиве
 * (NFR-2). Не путать с постраничным `limit` в BFF-ручке — здесь это
 * «загрузить всё для масштаба турнира».
 */
export const DEFAULT_LIST_LIMIT = 1000;

/** createAdminRequest — POST /api/admin/create. */
export async function createAdminRequest(
  input: CreateAdminInput,
): Promise<AdminResult> {
  return post("/api/admin/create", input);
}

/** listUsersRequest — GET /api/admin/users?limit=… (единственный источник списка, план §«Обзор» п.1). */
export async function listUsersRequest(limit: number = DEFAULT_LIST_LIMIT): Promise<ListResult> {
  const res = await apiFetch<{ users?: AdminUser[] }>(`/api/admin/users?limit=${limit}`, {
    method: "GET",
  });
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  return { ok: true, users: res.data.users ?? [] };
}

/** promoteUserRequest — POST /api/admin/promote. */
export async function promoteUserRequest(
  userId: string,
): Promise<ActionResult> {
  return post("/api/admin/promote", { userId });
}

/** demoteUserRequest — POST /api/admin/demote. */
export async function demoteUserRequest(
  userId: string,
): Promise<ActionResult> {
  return post("/api/admin/demote", { userId });
}

async function post(url: string, body: unknown): Promise<
  { ok: true; user: AdminUser } | { ok: false; error: string }
> {
  const res = await apiFetch<{ user?: AdminUser }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, user: res.data.user as AdminUser };
}
