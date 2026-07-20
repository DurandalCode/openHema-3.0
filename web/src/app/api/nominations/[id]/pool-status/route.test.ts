import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { getLayout: vi.fn(), setLayoutStatus: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { poolLayoutToJson } from "@/lib/grpc/serialize";
import { PoolLayoutStatus } from "@/gen/hema/v1/pool_pb";
import { GET, POST } from "./route";

function getReq() {
  return new NextRequest("http://localhost/api/nominations/n1/pool-status");
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/pool-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/pool-status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(401);
      expect(poolAdminClient.getLayout).not.toHaveBeenCalled();
    });

    it("maps ConnectError FailedPrecondition → 409", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.getLayout).mockRejectedValue(
        new ConnectError("err", Code.FailedPrecondition),
      );
      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(409);
    });

    it("returns status + canUndo slice from GetLayout on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.getLayout).mockResolvedValue({
        layout: { nominationId: "n1" },
      } as never);
      vi.mocked(poolLayoutToJson).mockReturnValue({
        nominationId: "n1",
        status: "POOL_LAYOUT_STATUS_READY",
        canUndo: true,
        pools: [],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        status: "POOL_LAYOUT_STATUS_READY",
        canUndo: true,
        hasDistributedFighters: false,
      });
      expect(poolAdminClient.getLayout).toHaveBeenCalledWith(
        { nominationId: "n1" },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    // Спека 0012, FR-9/AC-12: hasDistributedFighters вычисляется из
    // layout.pools без нового gRPC-вызова — истина, если хотя бы один пул
    // непустой.
    it("returns hasDistributedFighters:true when a pool has members", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.getLayout).mockResolvedValue({
        layout: { nominationId: "n1" },
      } as never);
      vi.mocked(poolLayoutToJson).mockReturnValue({
        nominationId: "n1",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        canUndo: true,
        pools: [
          { id: "p1", members: [] },
          { id: "p2", members: [{ fighterId: "f1", name: "A", club: "" }] },
        ],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      const data = await res.json();
      expect(data.hasDistributedFighters).toBe(true);
    });

    it("returns hasDistributedFighters:false when pools are empty", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.getLayout).mockResolvedValue({
        layout: { nominationId: "n1" },
      } as never);
      vi.mocked(poolLayoutToJson).mockReturnValue({
        nominationId: "n1",
        status: "POOL_LAYOUT_STATUS_DRAFT",
        canUndo: false,
        pools: [{ id: "p1", members: [] }],
      } as never);

      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      const data = await res.json();
      expect(data.hasDistributedFighters).toBe(false);
    });

    it("maps ConnectError PermissionDenied → 403", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.getLayout).mockRejectedValue(
        new ConnectError("forbidden", Code.PermissionDenied),
      );
      const res = await GET(getReq(), { params: Promise.resolve({ id: "n1" }) });
      expect(res.status).toBe(403);
    });
  });

  describe("POST", () => {
    it("returns 401 when no access token", async () => {
      vi.mocked(getAccessToken).mockResolvedValue(undefined);
      const res = await POST(postReq({ status: "ready" }), {
        params: Promise.resolve({ id: "n1" }),
      });
      expect(res.status).toBe(401);
      expect(poolAdminClient.setLayoutStatus).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid status value", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      const res = await POST(postReq({ status: "active" }), {
        params: Promise.resolve({ id: "n1" }),
      });
      expect(res.status).toBe(400);
      expect(poolAdminClient.setLayoutStatus).not.toHaveBeenCalled();
    });

    it("sets status to ready and returns layout JSON on ok", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.setLayoutStatus).mockResolvedValue({
        layout: { status: "POOL_LAYOUT_STATUS_READY" },
      } as never);

      const res = await POST(postReq({ status: "ready" }), {
        params: Promise.resolve({ id: "n1" }),
      });
      expect(res.status).toBe(200);
      expect(poolAdminClient.setLayoutStatus).toHaveBeenCalledWith(
        { nominationId: "n1", status: PoolLayoutStatus.READY },
        { headers: { Authorization: "Bearer token" } },
      );
    });

    it("sets status to draft", async () => {
      vi.mocked(getAccessToken).mockResolvedValue("token");
      vi.mocked(poolAdminClient.setLayoutStatus).mockResolvedValue({
        layout: { status: "POOL_LAYOUT_STATUS_DRAFT" },
      } as never);

      await POST(postReq({ status: "draft" }), { params: Promise.resolve({ id: "n1" }) });
      expect(poolAdminClient.setLayoutStatus).toHaveBeenCalledWith(
        { nominationId: "n1", status: PoolLayoutStatus.DRAFT },
        { headers: { Authorization: "Bearer token" } },
      );
    });
  });
});
