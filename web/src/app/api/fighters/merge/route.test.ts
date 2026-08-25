import { Code, ConnectError } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { mergeFighters: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn(),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/fighters/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/fighters/merge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token (spec 0040, FR-10)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ sourceFighterId: "f1", targetFighterId: "f2" }));
    expect(res.status).toBe(401);
    expect(fighterAdminClient.mergeFighters).not.toHaveBeenCalled();
  });

  it("returns 400 when sourceFighterId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ targetFighterId: "f2" }));
    expect(res.status).toBe(400);
    expect(fighterAdminClient.mergeFighters).not.toHaveBeenCalled();
  });

  it("returns 400 when targetFighterId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ sourceFighterId: "f1" }));
    expect(res.status).toBe(400);
    expect(fighterAdminClient.mergeFighters).not.toHaveBeenCalled();
  });

  it("returns 400 when sourceFighterId equals targetFighterId (ErrSameFighter guard)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ sourceFighterId: "f1", targetFighterId: "f1" }));
    expect(res.status).toBe(400);
    expect(fighterAdminClient.mergeFighters).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const badReq = new NextRequest("http://localhost/api/fighters/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("merges fighters on ok, returning the target fighter enriched with linked-account fields (FR-10/FR-10a)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const rawFighter = {
      id: "f2",
      linkedAccountId: "u1",
      linkedAccountDisplayName: "Ivan Petrov",
      mergedIntoId: "",
    };
    vi.mocked(fighterAdminClient.mergeFighters).mockResolvedValue({ fighter: rawFighter } as never);
    vi.mocked(fighterToJson).mockReturnValue({ id: "f2", name: "Ivan" } as never);

    const res = await POST(req({ sourceFighterId: "f1", targetFighterId: "f2" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      fighter: {
        id: "f2",
        name: "Ivan",
        linkedAccountId: "u1",
        linkedAccountDisplayName: "Ivan Petrov",
        mergedIntoId: "",
      },
    });
    expect(fighterAdminClient.mergeFighters).toHaveBeenCalledWith(
      { sourceFighterId: "f1", targetFighterId: "f2" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition (ErrAlreadyMerged/ErrCrossTournamentMerge) -> 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.mergeFighters).mockRejectedValue(
      new ConnectError("fighter already merged", Code.FailedPrecondition),
    );
    const res = await POST(req({ sourceFighterId: "f1", targetFighterId: "f2" }));
    expect(res.status).toBe(409);
  });
});
