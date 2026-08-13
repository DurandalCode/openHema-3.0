import type { AdminUser } from "../api/requests";

/** RoleFilter — фильтр по роли над списком учёток (FR-5). */
export type RoleFilter = "all" | "admin" | "user";

/** sortKey — имя, если непусто, иначе email (FR-3/FR-4: единая точка "имя или email"). */
function sortKey(user: Pick<AdminUser, "displayName" | "email">): string {
  const name = user.displayName.trim();
  return name !== "" ? name : user.email;
}

/**
 * sortUsers — детерминированный порядок строк (FR-3): сначала админы, затем
 * обычные пользователи; внутри группы — по имени, при пустом имени — по
 * email. Не мутирует вход.
 */
export function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => {
    const aAdmin = a.role === "ROLE_ADMIN";
    const bAdmin = b.role === "ROLE_ADMIN";
    if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
    return sortKey(a).localeCompare(sortKey(b), "ru");
  });
}

/**
 * filterUsers — фильтр по роли и подстрочный регистронезависимый поиск по
 * имени/email, применяются вместе (логическое И) — FR-5/FR-7.
 */
export function filterUsers(
  users: AdminUser[],
  { role, query }: { role: RoleFilter; query: string },
): AdminUser[] {
  const q = query.trim().toLowerCase();
  return users.filter((u) => {
    if (role === "admin" && u.role !== "ROLE_ADMIN") return false;
    if (role === "user" && u.role !== "ROLE_USER") return false;
    if (q === "") return true;
    return (
      u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });
}

export type RoleCounts = { admins: number; users: number; total: number };

/**
 * roleCounts — счётчики по всему списку (FR-6): намеренно без параметра
 * поиска — вызывающая сторона всегда передаёт полный, не отфильтрованный по
 * строке поиска список, чтобы счётчики чипов не зависели от неё (AC-3).
 */
export function roleCounts(users: AdminUser[]): RoleCounts {
  const admins = users.filter((u) => u.role === "ROLE_ADMIN").length;
  const regular = users.filter((u) => u.role === "ROLE_USER").length;
  return { admins, users: regular, total: users.length };
}

/**
 * initials — замена аватара (FR-4): первые буквы имени (до двух слов), при
 * пустом имени — первая буква email.
 */
export function initials(user: Pick<AdminUser, "displayName" | "email">): string {
  const name = user.displayName.trim();
  if (name !== "") {
    const parts = name.split(/\s+/).filter(Boolean);
    const letters = parts.slice(0, 2).map((p) => p[0]);
    return letters.join("").toUpperCase();
  }
  const email = user.email.trim();
  return email !== "" ? email[0].toUpperCase() : "";
}
