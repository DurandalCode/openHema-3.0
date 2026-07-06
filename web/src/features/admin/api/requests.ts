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
  | { ok: false; error: string };

export type ActionResult =
  | { ok: true; user: AdminUser }
  | { ok: false; error: string };

/** createAdminRequest — POST /api/admin/create. */
export async function createAdminRequest(
  input: CreateAdminInput,
): Promise<AdminResult> {
  return post<AdminUser>("/api/admin/create", input);
}

/** listAdminsRequest — GET /api/admin/admins. */
export async function listAdminsRequest(): Promise<ListResult> {
  return get<AdminUser[]>("/api/admin/admins", "admins");
}

/** listUsersRequest — GET /api/admin/users. */
export async function listUsersRequest(): Promise<ListResult> {
  return get<AdminUser[]>("/api/admin/users", "users");
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

async function get<T>(url: string, field: "users" | "admins"): Promise<ListResult> {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? "Ошибка запроса" };
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
