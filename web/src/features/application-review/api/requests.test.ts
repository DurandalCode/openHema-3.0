import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmPaymentRequest,
  editApplicationRequest,
  getApplicationRequest,
  listApplicationsOverviewRequest,
  registerFighterRequest,
} from "./requests";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/application-review/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listApplicationsOverviewRequest", () => {
    it("GETs overview with only tournamentId when no filters", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ applications: [{ id: "a1" }] }),
      });

      const result = await listApplicationsOverviewRequest("t1", {});

      expect(result).toEqual({ ok: true, applications: [{ id: "a1" }] });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/applications/overview?tournamentId=t1",
        { method: "GET" },
      );
    });

    it("includes status and nominationId filters when provided", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ applications: [] }) });

      await listApplicationsOverviewRequest("t1", { status: 3, nominationId: "n1" });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/applications/overview?tournamentId=t1&status=3&nominationId=n1",
        { method: "GET" },
      );
    });

    it("returns ok:false with server error", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "bad" }) });

      const result = await listApplicationsOverviewRequest("t1", {});

      expect(result).toEqual({ ok: false, error: "bad" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

      await expect(listApplicationsOverviewRequest("t1", {})).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("confirmPaymentRequest", () => {
    it("POSTs /api/applications/[id]/confirm-payment", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", state: "APPLICATION_STATE_PAID" } }),
      });

      const result = await confirmPaymentRequest("a1");

      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1/confirm-payment", {
        method: "POST",
      });
    });
  });

  describe("registerFighterRequest", () => {
    it("POSTs /api/applications/[id]/register and returns capacityExceeded", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          application: { id: "a1", state: "APPLICATION_STATE_REGISTERED" },
          capacityExceeded: true,
        }),
      });

      const result = await registerFighterRequest("a1");

      expect(result).toEqual({
        ok: true,
        application: { id: "a1", state: "APPLICATION_STATE_REGISTERED" },
        capacityExceeded: true,
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1/register", { method: "POST" });
    });

    it("returns ok:false with server error", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "invalid transition" }) });

      const result = await registerFighterRequest("a1");

      expect(result).toEqual({ ok: false, error: "invalid transition" });
    });
  });

  describe("editApplicationRequest", () => {
    it("POSTs /api/applications/[id]/edit with the given fields", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1", club: "HEMA Club" } }),
      });

      const result = await editApplicationRequest("a1", {
        club: "HEMA Club",
        needsEquipment: true,
        applicantNameOverride: "Ivan Petrov",
        nominationId: "n2",
        state: "APPLICATION_STATE_REGISTERED",
      });

      expect(result).toEqual({ ok: true, application: { id: "a1", club: "HEMA Club" } });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          club: "HEMA Club",
          needsEquipment: true,
          applicantNameOverride: "Ivan Petrov",
          nominationId: "n2",
          state: "APPLICATION_STATE_REGISTERED",
        }),
      });
    });

    it("returns ok:false with server error (e.g. transfer duplicate)", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "duplicate" }) });

      const result = await editApplicationRequest("a1", { club: "X" });

      expect(result).toEqual({ ok: false, error: "duplicate" });
    });
  });

  describe("getApplicationRequest", () => {
    it("GETs /api/applications/[id] and returns application + history", async () => {
      const application = { id: "a1", state: "APPLICATION_STATE_PAID" };
      const history = [{ type: "APPLICATION_EVENT_TYPE_SUBMITTED", actorId: "u1", actorDisplayName: "Иван" }];
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application, history }),
      });

      const result = await getApplicationRequest("a1");

      expect(result).toEqual({ ok: true, application, history });
      expect(fetchMock).toHaveBeenCalledWith("/api/applications/a1", { method: "GET" });
    });

    it("defaults history to [] when omitted", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ application: { id: "a1" } }),
      });

      const result = await getApplicationRequest("a1");

      expect(result).toEqual({ ok: true, application: { id: "a1" }, history: [] });
    });

    it("returns ok:false with server error", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) });

      const result = await getApplicationRequest("a1");

      expect(result).toEqual({ ok: false, error: "forbidden" });
    });

    it("returns ok:false on network failure", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));

      const result = await getApplicationRequest("a1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });
  });
});
