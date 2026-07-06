import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminRequest,
  demoteUserRequest,
  listAdminsRequest,
  listUsersRequest,
  promoteUserRequest,
} from "./requests";

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

  describe("listAdminsRequest", () => {
    it("returns ok:true with admins array", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ admins: [user] }) });

      const res = await listAdminsRequest();

      expect(res).toEqual({ ok: true, users: [user] });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/admins", { method: "GET" });
    });

    it("returns ok:false on 401", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "unauthenticated" }),
      });

      const res = await listAdminsRequest();

      expect(res).toEqual({ ok: false, error: "unauthenticated" });
    });

    it("returns empty array when field missing", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const res = await listAdminsRequest();

      expect(res).toEqual({ ok: true, users: [] });
    });
  });

  describe("listUsersRequest", () => {
    it("returns ok:true with users array", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ users: [user] }) });

      const res = await listUsersRequest();

      expect(res).toEqual({ ok: true, users: [user] });
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/users", { method: "GET" });
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
