import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { previewStageBuild: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grpc/serialize")>();
  return {
    ...actual,
    // tieResolutionDtoToProto остаётся реальным.
    stageBuildPreviewToJson: vi.fn((p) => p),
  };
});

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/build/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId]/build/preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.previewStageBuild).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const badReq = new NextRequest("http://localhost/api/stages/s1/build/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(badReq, { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("defaults ties to an empty array when omitted", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.previewStageBuild).mockResolvedValue({
      preview: { entries: [] },
    } as never);

    const res = await POST(req({}), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.previewStageBuild).toHaveBeenCalledWith(
      { stageId: "s1", ties: [] },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ties DTO to proto plain objects and returns preview JSON", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.previewStageBuild).mockResolvedValue({
      preview: { entries: [], capacity: 8 },
    } as never);

    const ties = [{ sourcePoolId: "p1", place: 2, fighterIds: ["f1", "f2"] }];
    const res = await POST(req({ ties }), { params: Promise.resolve({ stageId: "s1" }) });

    expect(res.status).toBe(200);
    expect(stageAdminClient.previewStageBuild).toHaveBeenCalledWith(
      { stageId: "s1", ties: [{ sourcePoolId: "p1", place: 2, fighterIds: ["f1", "f2"] }] },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.preview).toEqual({ entries: [], capacity: 8 });
  });

  it("maps ConnectError FailedPrecondition (no rule) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.previewStageBuild).mockRejectedValue(
      new ConnectError("no seeding rule", Code.FailedPrecondition),
    );
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.previewStageBuild).mockRejectedValue(
      new ConnectError("stage not found", Code.NotFound),
    );
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(404);
  });
});
