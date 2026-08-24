import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminRequest,
  demoteUserRequest,
  listUsersRequest,
  promoteUserRequest,
} from "./requests";
import * as requestsModule from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/admin/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const user = {
    id: "u1",
    email: "admin@hema.test",
    displayName: "Admin",
    role: "ROLE_ADMIN",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  describe("createAdminRequest", () => {
    it("returns ok:true with user on 2xx", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user }) });

      const res = await createAdminRequest({
        email: "admin@hema.test",
        password: "pass",
        displayName: "Admin",
      });

      expect(res).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@hema.test", password: "pass", displayName: "Admin" }),
      });
    });

    it("returns ok:false on 4xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Email уже занят" }),
      });

      const res = await createAdminRequest({ email: "x", password: "p", displayName: "d" });

      expect(res).toEqual({ ok: false, error: "Email уже занят" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const res = await createAdminRequest({ email: "x", password: "p", displayName: "d" });

      expect(res).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  it("does not export listAdminsRequest — the admin-only list is no longer consumed by this feature", () => {
    expect((requestsModule as Record<string, unknown>).listAdminsRequest).toBeUndefined();
  });

  describe("listUsersRequest", () => {
    it("returns ok:true with users array", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ users: [user] }) });

      const res = await listUsersRequest();

      expect(res).toEqual({ ok: true, users: [user] });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/admin\/users\?limit=\d+$/),
        { method: "GET" },
      );
    });

    it("sends an explicit limit in the query string", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ users: [] }) });

      await listUsersRequest(250);

      expect(fetchMock).toHaveBeenCalledWith("/api/admin/users?limit=250", { method: "GET" });
    });

    it("returns empty array when field missing", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const res = await listUsersRequest();

      expect(res).toEqual({ ok: true, users: [] });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17) instead of returning ok:false", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "authentication required" }),
      });

      await expect(listUsersRequest()).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("promoteUserRequest", () => {
    it("returns ok:true with updated user", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user }) });

      const res = await promoteUserRequest("u1");

      expect(res).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1" }),
      });
    });

    it("returns ok:false on 403", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "admin role required" }),
      });

      const res = await promoteUserRequest("u1");

      expect(res).toEqual({ ok: false, error: "admin role required" });
    });
  });

  describe("demoteUserRequest", () => {
    it("returns ok:true with updated user", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ user }) });

      const res = await demoteUserRequest("u1");

      expect(res).toEqual({ ok: true, user });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/demote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1" }),
      });
    });

    it("returns ok:false on 403 (self demote)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "forbidden" }),
      });

      const res = await demoteUserRequest("self-id");

      expect(res).toEqual({ ok: false, error: "forbidden" });
    });
  });
});
