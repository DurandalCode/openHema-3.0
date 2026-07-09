import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  nominationAdminClient: { reorderNominations: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationsToJson: vi.fn((n) => n),
}));

import { nominationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { nominationsToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/nominations/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/nominations/reorder route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["a", "b"] }));
    expect(res.status).toBe(401);
    expect(nominationAdminClient.reorderNominations).not.toHaveBeenCalled();
  });

  it("returns 400 when tournamentId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await POST(postReq({ orderedIds: ["a", "b"] }));
    expect(res.status).toBe(400);
    expect(nominationAdminClient.reorderNominations).not.toHaveBeenCalled();
  });

  it("returns 400 when orderedIds is missing or empty", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await POST(postReq({ tournamentId: "t1", orderedIds: [] }));
    expect(res.status).toBe(400);
    expect(nominationAdminClient.reorderNominations).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    const badReq = new NextRequest("http://localhost/api/nominations/reorder", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("forwards tournamentId + orderedIds + Bearer token on happy path", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(nominationAdminClient.reorderNominations).mockResolvedValue({
      nominations: [{ id: "b" }, { id: "a" }],
    } as never);
    vi.mocked(nominationsToJson).mockReturnValue([{ id: "b" }, { id: "a" }] as never);

    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["b", "a"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ nominations: [{ id: "b" }, { id: "a" }] });

    const call = vi.mocked(nominationAdminClient.reorderNominations).mock.calls[0];
    expect(call[1]).toEqual({ headers: { Authorization: "Bearer tok-xyz" } });
    expect(call[0]).toEqual({ tournamentId: "t1", orderedIds: ["b", "a"] });
  });

  it("maps ConnectError InvalidArgument → 400", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(nominationAdminClient.reorderNominations).mockRejectedValue(
      new ConnectError("bad input", Code.InvalidArgument),
    );

    const res = await POST(postReq({ tournamentId: "t1", orderedIds: ["a"] }));
    expect(res.status).toBe(400);
  });
});
