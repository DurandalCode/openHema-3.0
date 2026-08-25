import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getArenaJournalRequest } from "./requests";
import type { JournalEntryDto } from "@/entities/arena-live/lib/journal";
import { UnauthorizedError } from "@/shared/api/unauthorized";

describe("features/arena-journal/api/requests", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getArenaJournalRequest", () => {
    it("GETs /api/arenas/[id]/journal and returns the entries", async () => {
      const entries: JournalEntryDto[] = [
        {
          boutId: "b1",
          sequenceNumber: 7,
          fighterA: { fighterId: "f1", name: "Ильин", club: "" },
          fighterB: { fighterId: "f2", name: "Дерюгин", club: "" },
          kind: "BOUT_EVENT_KIND_STARTED",
          scoreA: 0,
          scoreB: 0,
          occurredAt: "2026-08-15T14:12:40",
          actorDisplayName: "",
        },
      ];
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ entries }) });

      const result = await getArenaJournalRequest("a1");

      expect(result).toEqual({ ok: true, entries });
      expect(fetchMock).toHaveBeenCalledWith("/api/arenas/a1/journal", { method: "GET" });
    });

    it("returns an empty array when the arena has no seated pool (AC-20)", async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) });

      const result = await getArenaJournalRequest("a1");

      expect(result).toEqual({ ok: true, entries: [] });
    });

    it("returns the error on non-ok response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        json: async () => ({ error: "not found" }),
      });

      const result = await getArenaJournalRequest("a1");

      expect(result).toEqual({ ok: false, error: "not found" });
    });

    it("returns a network error message on fetch failure", async () => {
      fetchMock.mockRejectedValue(new Error("boom"));

      const result = await getArenaJournalRequest("a1");

      expect(result).toEqual({ ok: false, error: "Сеть недоступна" });
    });

    it("throws UnauthorizedError on a 401 (spec 0039, FR-17)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "unauthenticated" }) });

      await expect(getArenaJournalRequest("a1")).rejects.toBeInstanceOf(UnauthorizedError);
    });
  });
});
