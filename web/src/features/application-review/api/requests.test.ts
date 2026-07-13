import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  confirmPaymentRequest,
  editApplicationRequest,
  listApplicationsOverviewRequest,
  registerFighterRequest,
} from "./requests";

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
});
