import type { Role } from "@/entities/user/lib/types";

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
  return post<AdminUser>("/api/admin/create", input);
}

/** listUsersRequest — GET /api/admin/users?limit=… (единственный источник списка, план §«Обзор» п.1). */
export async function listUsersRequest(limit: number = DEFAULT_LIST_LIMIT): Promise<ListResult> {
  return get<AdminUser[]>(`/api/admin/users?limit=${limit}`, "users");
}

/** promoteUserRequest — POST /api/admin/promote. */
export async function promoteUserRequest(
  userId: string,
): Promise<ActionResult> {
  return post<AdminUser>("/api/admin/promote", { userId });
}

/** demoteUserRequest — POST /api/admin/demote. */
export async function demoteUserRequest(
  userId: string,
): Promise<ActionResult> {
  return post<AdminUser>("/api/admin/demote", { userId });
}

async function get<T>(url: string, field: "users"): Promise<ListResult> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса", status: res.status };
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const users = (data[field] ?? []) as unknown as T;
    return { ok: true, users: users as AdminUser[] };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}

async function post<T>(url: string, body: unknown): Promise<
  { ok: true; user: AdminUser } | { ok: false; error: string }
> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
    }
    const data = (await res.json().catch(() => ({}))) as { user: T };
    return { ok: true, user: data.user as unknown as AdminUser };
  } catch {
    return { ok: false, error: "Сеть недоступна" };
  }
}
