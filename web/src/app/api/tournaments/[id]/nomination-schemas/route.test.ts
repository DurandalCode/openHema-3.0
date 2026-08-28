import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { listStagesForTournament: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grpc/serialize")>();
  return {
    ...actual,
    stagesToJson: vi.fn((s) => s ?? []),
    schemaIssuesToJson: vi.fn((i) => i ?? []),
  };
});

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/tournaments/t1/nomination-schemas");
}

describe("app/api/tournaments/[id]/nomination-schemas route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(401);
      expect(stageAdminClient.listStagesForTournament).not.toHaveBeenCalled();
    });

    it("lists schema entries for every nomination of the tournament", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.listStagesForTournament).mockResolvedValue({
        entries: [
          { nominationId: "n1", stages: [{ id: "s1" }], issues: [] },
          { nominationId: "n2", stages: [], issues: [] },
        ],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(200);
      expect(stageAdminClient.listStagesForTournament).toHaveBeenCalledWith(
        { tournamentId: "t1" },
        { headers: { Authorization: "Bearer token" } },
      );
      const json = await res.json();
      expect(json.entries).toEqual([
        { nominationId: "n1", stages: [{ id: "s1" }], issues: [] },
        { nominationId: "n2", stages: [], issues: [] },
      ]);
    });

    it("returns schema diagnostics alongside stages for each nomination (спека 0020, FR-8)", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const issues = [
        {
          severity: "SCHEMA_ISSUE_SEVERITY_WARNING",
          code: "SCHEMA_ISSUE_CODE_COVERAGE_GAP",
          stageIds: ["s1"],
          message: "Разрыв покрытия.",
        },
      ];
      vi.mocked(stageAdminClient.listStagesForTournament).mockResolvedValue({
        entries: [{ nominationId: "n1", stages: [{ id: "s1" }], issues }],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entries[0].issues).toEqual(issues);
    });

    it("returns an empty entries list when the tournament has no nominations", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.listStagesForTournament).mockResolvedValue({
        entries: [],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entries).toEqual([]);
    });

    it("maps ConnectError to an error response", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(stageAdminClient.listStagesForTournament).mockRejectedValue(
        new ConnectError("not found", Code.NotFound),
      );
      const res = await GET(getReq(), { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(404);
    });
  });
});
