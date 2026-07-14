import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  poolAdminClient: { undo: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { poolAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/nominations/n1/pool-undo", { method: "POST" });
}

describe("app/api/nominations/[id]/pool-undo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(poolAdminClient.undo).not.toHaveBeenCalled();
  });

  it("undoes and returns layout JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.undo).mockResolvedValue({
      layout: { pools: [], canUndo: false },
    } as never);

    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(200);
    expect(poolAdminClient.undo).toHaveBeenCalledWith(
      { nominationId: "n1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (nothing to undo) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(poolAdminClient.undo).mockRejectedValue(
      new ConnectError("nothing to undo", Code.FailedPrecondition),
    );
    const res = await POST(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });
});
