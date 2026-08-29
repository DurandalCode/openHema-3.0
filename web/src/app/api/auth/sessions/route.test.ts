import { ConnectError, Code } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { listSessions: vi.fn(), revokeOtherSessions: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  sessionToJson: vi.fn((s) => s),
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken, getRefreshToken } from "@/lib/session/cookies";
import { GET, DELETE } from "./route";

describe("app/api/auth/sessions route (GET)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(authClient.listSessions).not.toHaveBeenCalled();
  });

  it("forwards X-Refresh-Token so the server can mark the current session (AC-6)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-abc");
    const sessions = [
      {
        id: "s1",
        createdAt: "2026-08-01T00:00:00.000Z",
        lastSeenAt: "2026-08-28T00:00:00.000Z",
        current: true,
      },
    ];
    vi.mocked(authClient.listSessions).mockResolvedValue({ sessions } as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(authClient.listSessions).toHaveBeenCalledWith(
      {},
      {
        headers: {
          Authorization: "Bearer tok-xyz",
          "X-Refresh-Token": "refresh-abc",
        },
      },
    );
    const body = await res.json();
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].current).toBe(true);
  });

  it("still calls the RPC with an empty X-Refresh-Token when the cookie is missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(getRefreshToken).mockResolvedValue(undefined);
    vi.mocked(authClient.listSessions).mockResolvedValue({ sessions: [] } as never);

    await GET();

    expect(authClient.listSessions).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer tok-xyz", "X-Refresh-Token": "" } },
    );
  });
});

describe("app/api/auth/sessions route (DELETE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(authClient.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("forwards X-Refresh-Token and returns revokedCount (AC-7)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-abc");
    vi.mocked(authClient.revokeOtherSessions).mockResolvedValue({ revokedCount: 2 } as never);

    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revokedCount: 2 });
    expect(authClient.revokeOtherSessions).toHaveBeenCalledWith(
      {},
      {
        headers: {
          Authorization: "Bearer tok-xyz",
          "X-Refresh-Token": "refresh-abc",
        },
      },
    );
  });

  it("maps a backend failure to the mapped status", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(getRefreshToken).mockResolvedValue("refresh-abc");
    vi.mocked(authClient.revokeOtherSessions).mockRejectedValue(
      new ConnectError("internal error", Code.Internal),
    );

    const res = await DELETE();

    expect(res.status).toBe(500);
  });
});
