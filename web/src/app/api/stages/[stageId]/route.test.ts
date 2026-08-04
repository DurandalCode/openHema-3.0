import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { deleteStage: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  stagesToJson: vi.fn((s) => s ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { DELETE } from "./route";

function req() {
  return new NextRequest("http://localhost/api/stages/s1", { method: "DELETE" });
}

describe("app/api/stages/[stageId] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.deleteStage).not.toHaveBeenCalled();
  });

  it("deletes the stage and returns the remaining stages on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.deleteStage).mockResolvedValue({
      stages: [{ id: "s2" }],
    } as never);

    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.deleteStage).toHaveBeenCalledWith(
      { stageId: "s1" },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.stages).toEqual([{ id: "s2" }]);
  });

  it("maps ConnectError FailedPrecondition → 409 (groups stage / started bouts)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.deleteStage).mockRejectedValue(
      new ConnectError("not deletable", Code.FailedPrecondition),
    );
    const res = await DELETE(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });
});
