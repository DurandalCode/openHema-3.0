import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterClient: { getMyFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn(),
}));

import { fighterClient } from "@/lib/grpc/client";
import { fighterToJson } from "@/lib/grpc/serialize";
import { getAccessToken } from "@/lib/session/cookies";
import { getMyFighter } from "./get-my-fighter";

describe("getMyFighter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    expect(await getMyFighter()).toBeNull();
    expect(fighterClient.getMyFighter).not.toHaveBeenCalled();
  });

  it("returns the fighter DTO on a valid token with a fighter", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(fighterClient.getMyFighter).mockResolvedValue({ fighter: {} } as never);
    const fighter = { id: "f1", name: "Ivan", club: "Club X" };
    vi.mocked(fighterToJson).mockReturnValue(fighter as never);

    expect(await getMyFighter()).toEqual(fighter);
  });

  it("returns null when the server responds with an empty fighter (FR-41)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(fighterClient.getMyFighter).mockResolvedValue({ fighter: undefined } as never);
    vi.mocked(fighterToJson).mockReturnValue(null);

    expect(await getMyFighter()).toBeNull();
  });

  it("passes Bearer token in Authorization header", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-xyz");
    vi.mocked(fighterClient.getMyFighter).mockResolvedValue({ fighter: undefined } as never);
    vi.mocked(fighterToJson).mockReturnValue(null);

    await getMyFighter();

    expect(fighterClient.getMyFighter).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer token-xyz" } },
    );
  });

  it("returns null when gRPC throws", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token-abc");
    vi.mocked(fighterClient.getMyFighter).mockRejectedValue(new Error("unauthenticated"));

    expect(await getMyFighter()).toBeNull();
  });
});
