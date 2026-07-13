import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  declarePaymentRequest,
  listMyApplicationsRequest,
  submitApplicationRequest,
  withdrawApplicationRequest,
} from "./requests";

describe("features/my-applications/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listMyApplicationsRequest", () => {
    it("returns ok:true with applications on 2xx", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ applications: [{ id: "a1" }] }),
      });

      const result = await listMyApplicationsRequest();

      expect(result).toEqual({ ok: true, applications: [{ id: "a1" }] });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications", { method: "GET" });
    });

    it("returns ok:false with server error on 4xx", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "unauthenticated" }) });

      const result = await listMyApplicationsRequest();

      expect(result).toEqual({ ok: false, error: "unauthenticated" });
    });

    it("returns network error when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("network"));

      expect(await listMyApplicationsRequest()).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });

  describe("submitApplicationRequest", () => {
    it("POSTs /api/applications with nominationId and default club/needsEquipment", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", nominationId: "n1" } }),
      });

      const result = await submitApplicationRequest("n1");

      expect(result).toEqual({ ok: true, application: { id: "a1", nominationId: "n1" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominationId: "n1", club: "", needsEquipment: false }),
      });
    });

    it("POSTs club/needsEquipment when provided", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", nominationId: "n1", club: "Sokol" } }),
      });

      await submitApplicationRequest("n1", { club: "Sokol", needsEquipment: true });

      expect(fetchMock).toHaveBeenCalledWith("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nominationId: "n1", club: "Sokol", needsEquipment: true }),
      });
    });

    it("returns ok:false with server error (e.g. duplicate active)", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "duplicate" }) });

      const result = await submitApplicationRequest("n1");

      expect(result).toEqual({ ok: false, error: "duplicate" });
    });
  });

  describe("declarePaymentRequest", () => {
    it("POSTs /api/applications/[id]/declare-payment", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" } }),
      });

      const result = await declarePaymentRequest("a1");

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1/declare-payment", {
        method: "POST",
      });
    });
  });

  describe("withdrawApplicationRequest", () => {
    it("POSTs /api/applications/[id]/withdraw", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", state: "APPLICATION_STATE_WITHDRAWN" } }),
      });

      const result = await withdrawApplicationRequest("a1");

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1/withdraw", { method: "POST" });
    });

    it("returns ok:false with server error", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "invalid transition" }) });

      const result = await withdrawApplicationRequest("a1");

      expect(result).toEqual({ ok: false, error: "invalid transition" });
    });
  });
});
