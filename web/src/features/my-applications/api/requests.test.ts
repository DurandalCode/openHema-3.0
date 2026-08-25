import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  declarePaymentRequest,
  getMyApplicationRequest,
  listMyApplicationsRequest,
  submitApplicationRequest,
  withdrawApplicationRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

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

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17) instead of returning ok:false", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthenticated" }),
      });

      await expect(listMyApplicationsRequest()).rejects.toBeInstanceOf(UnauthorizedError);
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

    it("carries the HTTP status through on 409 (spec 0036, FR-6)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Вы уже подали заявку в эту номинацию" }),
      });

      const result = await submitApplicationRequest("n1");

      expect(result).toEqual({
        ok: false,
        error: "Вы уже подали заявку в эту номинацию",
        status: 409,
      });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

      await expect(submitApplicationRequest("n1")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("getMyApplicationRequest", () => {
    it("GETs /api/applications/[id] and returns application + history (spec 0040, FR-12)", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          application: { id: "a1" },
          history: [{ type: "APPLICATION_EVENT_TYPE_SUBMITTED", sequence: 1 }],
        }),
      });

      const result = await getMyApplicationRequest("a1");

      expect(result).toEqual({
        ok: true,
        application: { id: "a1" },
        history: [{ type: "APPLICATION_EVENT_TYPE_SUBMITTED", sequence: 1 }],
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1", { method: "GET" });
    });

    it("defaults history to [] when the server omits it", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ application: { id: "a1" } }) });

      const result = await getMyApplicationRequest("a1");

      expect(result).toEqual({ ok: true, application: { id: "a1" }, history: [] });
    });

    it("returns ok:false with server error on forbidden access to another applicant's application (spec 0040, FR-13/AC-9)", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "forbidden" }),
      });

      const result = await getMyApplicationRequest("a2");

      expect(result).toEqual({ ok: false, error: "forbidden", status: 403 });
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
