import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loginRequest,
  logoutRequest,
  registerRequest,
} from "./requests";

describe("features/auth/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("loginRequest", () => {
    it("returns ok:true on 2xx response", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await loginRequest({
        email: "ivan@example.com",
        password: "secret",
      });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ivan@example.com", password: "secret" }),
      });
    });

    it("returns ok:false with server error on 4xx/5xx", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Неверный email или пароль" }),
      });

      const result = await loginRequest({
        email: "ivan@example.com",
        password: "wrong",
      });

      expect(result).toEqual({ ok: false, error: "Неверный email или пароль" });
    });

    it("returns default error when server returns no error field", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });

      const result = await loginRequest({
        email: "x@y.z",
        password: "p",
      });

      expect(result).toEqual({ ok: false, error: "Ошибка запроса" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      const result = await loginRequest({
        email: "x@y.z",
        password: "p",
      });

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });

    it("returns default error when json() throws", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("invalid json");
        },
      });

      const result = await loginRequest({
        email: "x@y.z",
        password: "p",
      });

      expect(result).toEqual({ ok: false, error: "Ошибка запроса" });
    });
  });

  describe("registerRequest", () => {
    it("returns ok:true on 2xx response", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

      const result = await registerRequest({
        email: "ivan@example.com",
        password: "secret",
        displayName: "Иван",
      });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ivan@example.com",
          password: "secret",
          displayName: "Иван",
        }),
      });
    });

    it("returns ok:false with server error", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Email уже занят" }),
      });

      const result = await registerRequest({
        email: "ivan@example.com",
        password: "secret",
        displayName: "Иван",
      });

      expect(result).toEqual({ ok: false, error: "Email уже занят" });
    });
  });

  describe("logoutRequest", () => {
    it("POSTs /api/auth/logout", async () => {
      fetchMock.mockResolvedValue({ ok: true });

      await logoutRequest();

      expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
        method: "POST",
      });
    });

    it("swallows network error", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      await expect(logoutRequest()).resolves.toBeUndefined();
    });
  });
});
