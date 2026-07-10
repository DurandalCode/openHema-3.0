import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  applicationPublicClient: { listNominationParticipants: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationParticipantsToJson: vi.fn((p) => p),
}));

import { applicationPublicClient } from "@/lib/grpc/client";
import { getNominationParticipants } from "./get-nomination-participants";

describe("getNominationParticipants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns participants and counters on ok", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockResolvedValue({
      participants: [{ displayName: "Fighter One", state: "APPLICATION_STATE_REGISTERED" }],
      appliedCount: 12,
      confirmedCount: 8,
      fighterCapacity: 16,
    } as never);

    const result = await getNominationParticipants("n1");
    expect(result.appliedCount).toBe(12);
    expect(result.confirmedCount).toBe(8);
    expect(result.fighterCapacity).toBe(16);
    expect(result.participants).toEqual([
      { displayName: "Fighter One", state: "APPLICATION_STATE_REGISTERED" },
    ]);
  });

  it("returns null fighterCapacity when not set", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockResolvedValue({
      participants: [],
      appliedCount: 0,
      confirmedCount: 0,
      fighterCapacity: undefined,
    } as never);

    const result = await getNominationParticipants("n1");
    expect(result.fighterCapacity).toBeNull();
  });

  it("returns empty result when gRPC throws", async () => {
    vi.mocked(applicationPublicClient.listNominationParticipants).mockRejectedValue(
      new Error("not found"),
    );

    expect(await getNominationParticipants("n1")).toEqual({
      participants: [],
      appliedCount: 0,
      confirmedCount: 0,
      fighterCapacity: null,
    });
  });

  it("returns empty result when nominationId is empty", async () => {
    expect(await getNominationParticipants("")).toEqual({
      participants: [],
      appliedCount: 0,
      confirmedCount: 0,
      fighterCapacity: null,
    });
    expect(applicationPublicClient.listNominationParticipants).not.toHaveBeenCalled();
  });
});
