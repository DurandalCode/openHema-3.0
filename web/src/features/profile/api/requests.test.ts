import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import { changePasswordRequest, updateProfileRequest } from "./requests";

describe("features/profile/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("updateProfileRequest", () => {
    it("PATCHes /api/auth/profile and returns ok:true with the updated user", async () => {
      const user = {
        id: "u1",
        email: "ivan@example.com",
        displayName: "Иван Кравцов",
        role: "ROLE_USER",
        createdAt: "2026-01-14T00:00:00.000Z",
        club: "Северный клинок",
      };
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ user }) });

      const result = await updateProfileRequest({
        displayName: "Иван Кравцов",
        club: "Северный клинок",
      });

      expect(result).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Иван Кравцов", club: "Северный клинок" }),
      });
    });

    it("returns ok:false with the server's error on rejection (e.g. empty name)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "display name is required" }),
      });

      const result = await updateProfileRequest({ displayName: "", club: "" });

      expect(result).toEqual({ ok: false, error: "display name is required" });
    });

    it("throws UnauthorizedError on 401 instead of returning ok:false", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthenticated" }),
      });

      await expect(
        updateProfileRequest({ displayName: "Иван", club: "" }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await updateProfileRequest({ displayName: "Иван", club: "" });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("changePasswordRequest", () => {
    it("POSTs /api/auth/password and returns ok:true", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

      const result = await changePasswordRequest({
        currentPassword: "old12345",
        newPassword: "new12345",
      });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "old12345", newPassword: "new12345" }),
      });
    });

    it("returns ok:false with the server's error on a wrong current password", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "неверный текущий пароль" }),
      });

      const result = await changePasswordRequest({
        currentPassword: "wrong",
        newPassword: "new12345",
      });

      expect(result).toEqual({ ok: false, error: "неверный текущий пароль" });
    });

    it("throws UnauthorizedError on 401 instead of returning ok:false", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthenticated" }),
      });

      await expect(
        changePasswordRequest({ currentPassword: "a", newPassword: "b12345678" }),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await changePasswordRequest({
        currentPassword: "old12345",
        newPassword: "new12345",
      });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
