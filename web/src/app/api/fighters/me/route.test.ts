import { Code, ConnectError } from "@connectrpc/connect";
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
import { GET } from "./route";

describe("app/api/fighters/me route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthenticated" });
    expect(fighterClient.getMyFighter).not.toHaveBeenCalled();
  });

  it("returns {fighter: null} when the server responds with an empty fighter", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(fighterClient.getMyFighter).mockResolvedValue({ fighter: undefined } as never);
    vi.mocked(fighterToJson).mockReturnValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fighter: null });
    expect(fighterClient.getMyFighter).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("returns {fighter: {...}} when the server responds with a fighter", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const fighter = { id: "f1", name: "Ivan", club: "Club X" };
    vi.mocked(fighterClient.getMyFighter).mockResolvedValue({ fighter: {} } as never);
    vi.mocked(fighterToJson).mockReturnValue(fighter as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fighter });
  });

  it("maps a ConnectError from the RPC via errorResponse", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(fighterClient.getMyFighter).mockRejectedValue(
      new ConnectError("internal", Code.Internal),
    );

    const res = await GET();

    expect(res.status).toBe(500);
  });

  it("maps an unauthenticated error from the RPC to 401", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(fighterClient.getMyFighter).mockRejectedValue(
      new ConnectError("authentication required", Code.Unauthenticated),
    );

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
