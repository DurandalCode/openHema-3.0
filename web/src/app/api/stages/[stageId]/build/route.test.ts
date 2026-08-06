import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { buildStage: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/grpc/serialize")>();
  return {
    ...actual,
    // tieResolutionDtoToProto остаётся реальным.
    poolLayoutToJson: vi.fn((l) => l),
    bracketToJson: vi.fn((b) => b),
  };
});

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/stages/s1/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/stages/[stageId]/build route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.buildStage).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const badReq = new NextRequest("http://localhost/api/stages/s1/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(badReq, { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("builds a groups stage: returns layout, bracket stays null", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.buildStage).mockResolvedValue({
      result: { case: "layout", value: { pools: [] } },
    } as never);

    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    expect(stageAdminClient.buildStage).toHaveBeenCalledWith(
      { stageId: "s1", ties: [] },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.layout).toEqual({ pools: [] });
    expect(json.bracket).toBeNull();
  });

  it("builds a bracket stage: returns bracket, layout stays null", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.buildStage).mockResolvedValue({
      result: { case: "bracket", value: { rounds: [] } },
    } as never);

    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bracket).toEqual({ rounds: [] });
    expect(json.layout).toBeNull();
  });

  it("maps ties DTO to proto plain objects", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.buildStage).mockResolvedValue({
      result: { case: "layout", value: { pools: [] } },
    } as never);

    const ties = [{ sourcePoolId: "", place: 4, fighterIds: ["f1"] }];
    await POST(req({ ties }), { params: Promise.resolve({ stageId: "s1" }) });

    expect(stageAdminClient.buildStage).toHaveBeenCalledWith(
      { stageId: "s1", ties: [{ sourcePoolId: "", place: 4, fighterIds: ["f1"] }] },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (unresolved tie) → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.buildStage).mockRejectedValue(
      new ConnectError("tie unresolved", Code.FailedPrecondition),
    );
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.buildStage).mockRejectedValue(
      new ConnectError("stage not found", Code.NotFound),
    );
    const res = await POST(req({ ties: [] }), { params: Promise.resolve({ stageId: "s1" }) });
    expect(res.status).toBe(404);
  });
});
