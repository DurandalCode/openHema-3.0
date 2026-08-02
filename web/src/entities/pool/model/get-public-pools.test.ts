import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  stagePublicClient: { listPublicPools: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  poolsToJson: vi.fn((p) => p),
}));

import { stagePublicClient } from "@/lib/grpc/client";
import { getPublicPools } from "./get-public-pools";

describe("getPublicPools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pools JSON on ok", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockResolvedValue({
      pools: [{ id: "p1", name: "Пул 1" }],
    } as never);

    const pools = await getPublicPools("n1");
    expect(pools).toEqual([{ id: "p1", name: "Пул 1" }]);
    expect(stagePublicClient.listPublicPools).toHaveBeenCalledWith({ nominationId: "n1" });
  });

  it("returns empty array when gRPC throws", async () => {
    vi.mocked(stagePublicClient.listPublicPools).mockRejectedValue(new Error("boom"));

    expect(await getPublicPools("n1")).toEqual([]);
  });

  it("returns empty array when nominationId is empty", async () => {
    expect(await getPublicPools("")).toEqual([]);
    expect(stagePublicClient.listPublicPools).not.toHaveBeenCalled();
  });
});
