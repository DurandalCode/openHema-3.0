import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { revealCurrentBout: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaLiveToJson: vi.fn((s) => s ?? null),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function postReq() {
  return new NextRequest("http://localhost/api/arenas/a1/reveal-bout", { method: "POST" });
}

describe("app/api/arenas/[id]/reveal-bout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(postReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.revealCurrentBout).not.toHaveBeenCalled();
  });

  it("reveals and returns the snapshot on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.revealCurrentBout).mockResolvedValue({
      snapshot: { room: { revealGeneration: 1 } },
    } as never);

    const res = await POST(postReq(), { params: Promise.resolve({ id: "a1" }) });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ snapshot: { room: { revealGeneration: 1 } } });
    expect(stageAdminClient.revealCurrentBout).toHaveBeenCalledWith(
      { arenaId: "a1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.revealCurrentBout).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await POST(postReq(), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(404);
  });
});
