import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  nominationClient: { listNominations: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  nominationsToJson: vi.fn((n) => n),
}));

import { nominationClient } from "@/lib/grpc/client";
import { getNominations } from "./get-nominations";

describe("getNominations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns nominations JSON on ok", async () => {
    vi.mocked(nominationClient.listNominations).mockResolvedValue({
      nominations: [{ id: "n1", title: "A" }],
    } as never);

    const list = await getNominations("t1");
    expect(list).toEqual([{ id: "n1", title: "A" }]);
    expect(nominationClient.listNominations).toHaveBeenCalledWith({ tournamentId: "t1" });
  });

  it("returns empty array when gRPC throws (NotFound/any)", async () => {
    vi.mocked(nominationClient.listNominations).mockRejectedValue(new Error("not found"));

    expect(await getNominations("t1")).toEqual([]);
  });

  it("returns empty array when tournamentId is empty", async () => {
    expect(await getNominations("")).toEqual([]);
    expect(nominationClient.listNominations).not.toHaveBeenCalled();
  });
});
