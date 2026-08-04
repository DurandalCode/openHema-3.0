import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { resetLayout: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolLayoutToJson: vi.fn((l) => l),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/stages/s1/reset", { method: "POST" });
}

describe("app/api/stages/[stageId]/reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.resetLayout).not.toHaveBeenCalled();
  });

  it("resets the stage layout and returns JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.resetLayout).mockResolvedValue({
      layout: { pools: [] },
    } as never);

    const res = await POST(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.resetLayout).toHaveBeenCalledWith(
      { stageId: "s1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.resetLayout).mockRejectedValue(
      new ConnectError("not draft", Code.FailedPrecondition),
    );
    const res = await POST(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });
});
