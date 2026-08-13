import { describe, expect, it } from "vitest";
import { filterUsers, initials, roleCounts, sortUsers } from "./select-users";
import type { AdminUser } from "../api/requests";

function user(overrides: Partial<AdminUser>): AdminUser {
  return {
    id: "id",
    email: "user@hema.test",
    displayName: "",
    role: "ROLE_USER",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("features/admin/lib/select-users", () => {
  describe("sortUsers", () => {
    it("puts admins above regular users (FR-3)", () => {
      const regular = user({ id: "u1", displayName: "Борис", role: "ROLE_USER" });
      const admin = user({ id: "a1", displayName: "Яков", role: "ROLE_ADMIN" });

      const result = sortUsers([regular, admin]);

      expect(result.map((u) => u.id)).toEqual(["a1", "u1"]);
    });

    it("sorts within a group by name", () => {
      const b = user({ id: "b", displayName: "Борис", role: "ROLE_USER" });
      const a = user({ id: "a", displayName: "Анна", role: "ROLE_USER" });

      const result = sortUsers([b, a]);

      expect(result.map((u) => u.id)).toEqual(["a", "b"]);
    });

    it("falls back to email when name is empty (FR-3)", () => {
      const named = user({ id: "named", displayName: "Юлия", role: "ROLE_USER" });
      const noName = user({ id: "noname", displayName: "", email: "аа@hema.test", role: "ROLE_USER" });

      const result = sortUsers([named, noName]);

      expect(result.map((u) => u.id)).toEqual(["noname", "named"]);
    });

    it("does not mutate the input array", () => {
      const list = [user({ id: "b", displayName: "Б" }), user({ id: "a", displayName: "А" })];
      const copy = [...list];

      sortUsers(list);

      expect(list).toEqual(copy);
    });
  });

  describe("filterUsers", () => {
    const admin = user({ id: "a1", displayName: "Анна Кораблёва", email: "a.korableva@klinok.ru", role: "ROLE_ADMIN" });
    const regular = user({ id: "u1", displayName: "Борис Волков", email: "boris.a@klinok.ru", role: "ROLE_USER" });
    const all = [admin, regular];

    it("filters by role", () => {
      expect(filterUsers(all, { role: "admin", query: "" }).map((u) => u.id)).toEqual(["a1"]);
      expect(filterUsers(all, { role: "user", query: "" }).map((u) => u.id)).toEqual(["u1"]);
      expect(filterUsers(all, { role: "all", query: "" }).map((u) => u.id)).toEqual(["a1", "u1"]);
    });

    it("matches by substring on name, case-insensitive (FR-7/AC-5)", () => {
      const result = filterUsers(all, { role: "all", query: "КОРАБ" });
      expect(result.map((u) => u.id)).toEqual(["a1"]);
    });

    it("matches by substring on email, case-insensitive (FR-7/AC-5)", () => {
      const result = filterUsers(all, { role: "all", query: "BORIS.A" });
      expect(result.map((u) => u.id)).toEqual(["u1"]);
    });

    it("combines role filter and search (FR-7/AC-6)", () => {
      // "о" (Cyrillic) matches both display names ("Кораблёва", "Волков"),
      // but role=user keeps only the regular user.
      const result = filterUsers(all, { role: "user", query: "о" });
      expect(result.map((u) => u.id)).toEqual(["u1"]);
    });

    it("returns empty array when nothing matches", () => {
      expect(filterUsers(all, { role: "all", query: "zzz-nope" })).toEqual([]);
    });
  });

  describe("roleCounts", () => {
    it("counts admins/users/total across the whole list (FR-6)", () => {
      const admin = user({ id: "a1", role: "ROLE_ADMIN" });
      const u1 = user({ id: "u1", role: "ROLE_USER" });
      const u2 = user({ id: "u2", role: "ROLE_USER" });

      expect(roleCounts([admin, u1, u2])).toEqual({ admins: 1, users: 2, total: 3 });
    });

    it("has no query parameter — callers always pass the full unfiltered list, so counts stay independent of search (AC-3)", () => {
      const admin = user({ id: "a1", role: "ROLE_ADMIN" });
      const u1 = user({ id: "u1", role: "ROLE_USER" });

      expect(roleCounts([admin, u1])).toEqual({ admins: 1, users: 1, total: 2 });
    });
  });

  describe("initials", () => {
    it("takes first letters of a two-word name (FR-4)", () => {
      expect(initials(user({ displayName: "Анна Кораблёва" }))).toBe("АК");
    });

    it("takes the first letter of a single-word name", () => {
      expect(initials(user({ displayName: "Анна" }))).toBe("А");
    });

    it("falls back to the first letter of the email when name is empty (FR-4)", () => {
      expect(initials(user({ displayName: "", email: "boris@hema.test" }))).toBe("B");
    });

    it("falls back to first letter of email when name is only whitespace", () => {
      expect(initials(user({ displayName: "   ", email: "zed@hema.test" }))).toBe("Z");
    });
  });
});
