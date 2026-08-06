import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { getBracket: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  bracketToJson: vi.fn((b) => b),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function req() {
  return new NextRequest("http://localhost/api/stages/s1/bracket");
}

describe("app/api/stages/[stageId]/bracket route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.getBracket).not.toHaveBeenCalled();
  });

  it("returns the bracket JSON on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getBracket).mockResolvedValue({
      bracket: { rounds: [] },
    } as never);

    const res = await GET(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.getBracket).toHaveBeenCalledWith(
      { stageId: "s1" },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.bracket).toEqual({ rounds: [] });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.getBracket).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(req(), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(404);
  });
});
