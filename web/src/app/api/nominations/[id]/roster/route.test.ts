import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  fighterPublicClient: { listNominationRoster: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  rosterEntriesToJson: vi.fn((e) => e),
}));
vi.mock("@/lib/grpc/preprod-guard", () => ({ assertPreprodAccess: vi.fn() }));

import { fighterPublicClient } from "@/lib/grpc/client";
import { assertPreprodAccess } from "@/lib/grpc/preprod-guard";
import { rosterEntriesToJson } from "@/lib/grpc/serialize";
import { GET } from "./route";

function ctx() {
  return { params: Promise.resolve({ id: "n1" }) };
}

describe("app/api/nominations/[id]/roster route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns roster entries JSON without auth", async () => {
    vi.mocked(fighterPublicClient.listNominationRoster).mockResolvedValue({
      entries: [{ name: "Ivan", club: "Club X", inRoster: true }],
    } as never);
    vi.mocked(rosterEntriesToJson).mockReturnValue([
      { name: "Ivan", club: "Club X", inRoster: true },
    ] as never);

    const res = await GET(new NextRequest("http://localhost/api/nominations/n1/roster"), ctx());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ entries: [{ name: "Ivan", club: "Club X", inRoster: true }] });
    expect(fighterPublicClient.listNominationRoster).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("maps ConnectError NotFound → 404", async () => {
    vi.mocked(fighterPublicClient.listNominationRoster).mockRejectedValue(
      new ConnectError("not found", Code.NotFound),
    );
    const res = await GET(new NextRequest("http://localhost/api/nominations/n1/roster"), ctx());
    expect(res.status).toBe(404);
  });

  it("returns 401 and skips upstream when preprod gate blocks the request", async () => {
    vi.mocked(assertPreprodAccess).mockResolvedValueOnce(
      NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    );

    const res = await GET(new NextRequest("http://localhost/api/nominations/n1/roster"), ctx());
    expect(res.status).toBe(401);
    expect(fighterPublicClient.listNominationRoster).not.toHaveBeenCalled();
  });
});
