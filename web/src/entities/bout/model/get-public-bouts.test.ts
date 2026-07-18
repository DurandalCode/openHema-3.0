import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  boutPublicClient: { listPublicBoutsByNomination: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  boutsToJson: vi.fn((b) => b),
}));

import { boutPublicClient } from "@/lib/grpc/client";
import { getPublicBouts } from "./get-public-bouts";

describe("getPublicBouts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns bouts JSON on ok", async () => {
    vi.mocked(boutPublicClient.listPublicBoutsByNomination).mockResolvedValue({
      bouts: [{ id: "b1", poolId: "p1" }],
    } as never);

    const bouts = await getPublicBouts("n1");
    expect(bouts).toEqual([{ id: "b1", poolId: "p1" }]);
    expect(boutPublicClient.listPublicBoutsByNomination).toHaveBeenCalledWith({
      nominationId: "n1",
    });
  });

  it("returns empty array when gRPC throws", async () => {
    vi.mocked(boutPublicClient.listPublicBoutsByNomination).mockRejectedValue(new Error("boom"));

    expect(await getPublicBouts("n1")).toEqual([]);
  });

  it("returns empty array when nominationId is empty", async () => {
    expect(await getPublicBouts("")).toEqual([]);
    expect(boutPublicClient.listPublicBoutsByNomination).not.toHaveBeenCalled();
  });
});
