import { Code, ConnectError } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { findFighterByAccount: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn(),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function req(params: Record<string, string>) {
  return new NextRequest(
    `http://localhost/api/fighters/find-by-account?${new URLSearchParams(params)}`,
  );
}

describe("app/api/fighters/find-by-account route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token (spec 0040, FR-9)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await GET(req({ userId: "u1" }));
    expect(res.status).toBe(401);
    expect(fighterAdminClient.findFighterByAccount).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await GET(req({}));
    expect(res.status).toBe(400);
    expect(fighterAdminClient.findFighterByAccount).not.toHaveBeenCalled();
  });

  it("passes userId and tournamentId to the RPC, tournamentId empty -> undefined (active tournament)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.findFighterByAccount).mockResolvedValue({
      fighter: undefined,
    } as never);
    vi.mocked(fighterToJson).mockReturnValue(null);

    const res = await GET(req({ userId: "u1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fighter: null });
    expect(fighterAdminClient.findFighterByAccount).toHaveBeenCalledWith(
      { userId: "u1", tournamentId: undefined },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("returns the found fighter enriched with linked-account fields (FR-8/FR-9)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const rawFighter = {
      id: "f1",
      linkedAccountId: "u1",
      linkedAccountDisplayName: "Ivan Petrov",
      mergedIntoId: "",
    };
    vi.mocked(fighterAdminClient.findFighterByAccount).mockResolvedValue({
      fighter: rawFighter,
    } as never);
    vi.mocked(fighterToJson).mockReturnValue({ id: "f1", name: "Ivan" } as never);

    const res = await GET(req({ userId: "u1", tournamentId: "t1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      fighter: {
        id: "f1",
        name: "Ivan",
        linkedAccountId: "u1",
        linkedAccountDisplayName: "Ivan Petrov",
        mergedIntoId: "",
      },
    });
    expect(fighterAdminClient.findFighterByAccount).toHaveBeenCalledWith(
      { userId: "u1", tournamentId: "t1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError via errorResponse", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.findFighterByAccount).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(req({ userId: "u1" }));
    expect(res.status).toBe(404);
  });
});
