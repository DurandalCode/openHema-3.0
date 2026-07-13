import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  fighterPublicClient: { listNominationRoster: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  rosterEntriesToJson: vi.fn((e) => e),
}));

import { fighterPublicClient } from "@/lib/grpc/client";
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
});
