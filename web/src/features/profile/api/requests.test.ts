import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "@/shared/api/unauthorized";
import {
  cancelEmailChangeRequest,
  changePasswordRequest,
  confirmEmailChangeRequest,
  listSessionsRequest,
  requestEmailChangeRequest,
  resendEmailVerificationRequest,
  revokeOtherSessionsRequest,
  revokeSessionRequest,
  updateNotificationSettingsRequest,
  updateProfileRequest,
  verifyEmailRequest,
} from "./requests";

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

  describe("verifyEmailRequest", () => {
    it("POSTs the token to /api/auth/email/verify and returns ok:true", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

      const result = await verifyEmailRequest("tok-abc");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-abc" }),
      });
    });

    it("returns ok:false with the server's error (invalid/expired link)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid token" }),
      });

      const result = await verifyEmailRequest("bad-tok");

      expect(result).toEqual({ ok: false, error: "invalid token" });
    });
  });

  describe("resendEmailVerificationRequest", () => {
    it("POSTs to /api/auth/email/resend and returns ok:true", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

      const result = await resendEmailVerificationRequest();

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/resend", { method: "POST" });
    });

    it("returns ok:false with the throttling error (429)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "слишком много попыток, попробуйте позже" }),
      });

      const result = await resendEmailVerificationRequest();

      expect(result).toEqual({ ok: false, error: "слишком много попыток, попробуйте позже" });
    });
  });

  describe("requestEmailChangeRequest", () => {
    it("POSTs newEmail/currentPassword and returns ok:true with the updated user", async () => {
      const user = { id: "u1", pendingEmail: "new@example.com" };
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ user }) });

      const result = await requestEmailChangeRequest("new@example.com", "pw");

      expect(result).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: "new@example.com", currentPassword: "pw" }),
      });
    });

    it("returns ok:false when the address is already taken (409)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "email taken" }),
      });

      const result = await requestEmailChangeRequest("taken@example.com", "pw");

      expect(result).toEqual({ ok: false, error: "email taken" });
    });
  });

  describe("cancelEmailChangeRequest", () => {
    it("DELETEs /api/auth/email/change and returns ok:true with the updated user", async () => {
      const user = { id: "u1", pendingEmail: "" };
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ user }) });

      const result = await cancelEmailChangeRequest();

      expect(result).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/change", { method: "DELETE" });
    });
  });

  describe("confirmEmailChangeRequest", () => {
    it("POSTs the token to /api/auth/email/change/confirm and returns ok:true", async () => {
      const user = { id: "u1", email: "new@example.com" };
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ user }) });

      const result = await confirmEmailChangeRequest("tok-abc");

      expect(result).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/email/change/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok-abc" }),
      });
    });

    it("returns ok:false on an invalid/expired/taken-address failure (unified message)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid token" }),
      });

      const result = await confirmEmailChangeRequest("bad-tok");

      expect(result).toEqual({ ok: false, error: "invalid token" });
    });
  });

  describe("listSessionsRequest", () => {
    it("GETs /api/auth/sessions and returns ok:true with the session list", async () => {
      const sessions = [
        { id: "s1", createdAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-28T00:00:00.000Z", current: true },
      ];
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ sessions }) });

      const result = await listSessionsRequest();

      expect(result).toEqual({ ok: true, sessions });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions", undefined);
    });

    it("throws UnauthorizedError on 401", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthenticated" }),
      });

      await expect(listSessionsRequest()).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("revokeSessionRequest", () => {
    it("DELETEs /api/auth/sessions/[id] and returns ok:true", async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

      const result = await revokeSessionRequest("s1");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions/s1", { method: "DELETE" });
    });

    it("returns ok:false when revoking another user's session (403)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "not your session" }),
      });

      const result = await revokeSessionRequest("someone-elses");

      expect(result).toEqual({ ok: false, error: "not your session" });
    });
  });

  describe("revokeOtherSessionsRequest", () => {
    it("DELETEs /api/auth/sessions and returns ok:true with revokedCount", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ revokedCount: 2 }),
      });

      const result = await revokeOtherSessionsRequest();

      expect(result).toEqual({ ok: true, revokedCount: 2 });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sessions", { method: "DELETE" });
    });
  });

  describe("updateNotificationSettingsRequest", () => {
    it("PUTs the settings and returns ok:true with the updated user", async () => {
      const user = { id: "u1", notifications: { applicationState: true, poolSeated: false } };
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ user }) });

      const result = await updateNotificationSettingsRequest({
        applicationState: true,
        poolSeated: false,
      });

      expect(result).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationState: true, poolSeated: false }),
      });
    });

    it("returns ok:false when the address is not verified (409, FR-21)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "email not verified" }),
      });

      const result = await updateNotificationSettingsRequest({
        applicationState: true,
        poolSeated: false,
      });

      expect(result).toEqual({ ok: false, error: "email not verified" });
    });
  });
});
