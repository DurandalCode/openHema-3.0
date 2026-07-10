import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  applicationPublicClient: { listNominationParticipants: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationParticipantsToJson: vi.fn((p) => p),
}));

import { applicationPublicClient } from "@/lib/grpc/client";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/nominations/[id]/participants route (public)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns participants and counters without requiring a token", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockResolvedValue({
      participants: [{ displayName: "Fighter One", state: "APPLICATION_STATE_REGISTERED" }],
      appliedCount: 12,
      confirmedCount: 8,
      fighterCapacity: 16,
    } as never);

    const res = await GET(new NextRequest("http://localhost"), ctx("n1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appliedCount).toBe(12);
    expect(data.confirmedCount).toBe(8);
    expect(data.fighterCapacity).toBe(16);
    expect(applicationPublicClient.listNominationParticipants).toHaveBeenCalledWith({
      nominationId: "n1",
    });
  });

  it("returns null fighterCapacity when not set", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockResolvedValue({
      participants: [],
      appliedCount: 0,
      confirmedCount: 0,
      fighterCapacity: undefined,
    } as never);

    const res = await GET(new NextRequest("http://localhost"), ctx("n1"));
    const data = await res.json();
    expect(data.fighterCapacity).toBeNull();
  });

  it("maps CodeNotFound to 404", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockRejectedValue(
      new ConnectError("missing", Code.NotFound),
    );

    const res = await GET(new NextRequest("http://localhost"), ctx("missing"));
    expect(res.status).toBe(404);
  });
});
