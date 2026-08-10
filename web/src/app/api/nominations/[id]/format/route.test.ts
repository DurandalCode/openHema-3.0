import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  stageAdminClient: { applyFormat: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  stagesToJson: vi.fn((s) => s ?? []),
}));

import { stageAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/n1/format", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/[id]/format route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ presetId: "p1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(401);
    expect(stageAdminClient.applyFormat).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const badReq = new NextRequest("http://localhost/api/nominations/n1/format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(badReq, { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
    expect(stageAdminClient.applyFormat).not.toHaveBeenCalled();
  });

  it("returns 400 when neither presetId nor sourceNominationId is set", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({}), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(400);
    expect(stageAdminClient.applyFormat).not.toHaveBeenCalled();
  });

  it("returns 400 when both presetId and sourceNominationId are set", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ presetId: "p1", sourceNominationId: "n2" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(400);
    expect(stageAdminClient.applyFormat).not.toHaveBeenCalled();
  });

  it("applies a format from a preset and returns the new stages on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.applyFormat).mockResolvedValue({
      stages: [{ id: "s1" }, { id: "s2" }],
    } as never);

    const res = await POST(req({ presetId: "p1" }), { params: Promise.resolve({ id: "n1" }) });

    expect(res.status).toBe(200);
    expect(stageAdminClient.applyFormat).toHaveBeenCalledWith(
      { nominationId: "n1", source: { case: "presetId", value: "p1" } },
      { headers: { Authorization: "Bearer token" } },
    );
    const json = await res.json();
    expect(json.stages).toEqual([{ id: "s1" }, { id: "s2" }]);
  });

  it("applies a format from a donor nomination and returns the new stages on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.applyFormat).mockResolvedValue({
      stages: [{ id: "s3" }],
    } as never);

    const res = await POST(req({ sourceNominationId: "n2" }), {
      params: Promise.resolve({ id: "n1" }),
    });

    expect(res.status).toBe(200);
    expect(stageAdminClient.applyFormat).toHaveBeenCalledWith(
      { nominationId: "n1", source: { case: "sourceNominationId", value: "n2" } },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409 (schema not empty)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.applyFormat).mockRejectedValue(
      new ConnectError("schema not empty", Code.FailedPrecondition),
    );
    const res = await POST(req({ presetId: "p1" }), { params: Promise.resolve({ id: "n1" }) });
    expect(res.status).toBe(409);
  });

  it("maps ConnectError InvalidArgument → 400 (donor is the target nomination)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.applyFormat).mockRejectedValue(
      new ConnectError("invalid source", Code.InvalidArgument),
    );
    const res = await POST(req({ sourceNominationId: "n1" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(400);
  });

  it("maps ConnectError NotFound → 404 (preset not found)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(stageAdminClient.applyFormat).mockRejectedValue(
      new ConnectError("preset not found", Code.NotFound),
    );
    const res = await POST(req({ presetId: "missing" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(404);
  });
});
