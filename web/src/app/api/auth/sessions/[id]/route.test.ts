import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { revokeSession: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { DELETE } from "./route";

function req() {
  return new NextRequest("http://localhost/api/auth/sessions/s1", { method: "DELETE" });
}

describe("app/api/auth/sessions/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await DELETE(req(), { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(401);
    expect(authClient.revokeSession).not.toHaveBeenCalled();
  });

  it("calls RevokeSession with the session id and only Authorization (no X-Refresh-Token needed)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.revokeSession).mockResolvedValue({} as never);

    const res = await DELETE(req(), { params: Promise.resolve({ id: "s1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.revokeSession).toHaveBeenCalledWith(
      { sessionId: "s1" },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("maps another user's session (PermissionDenied) to 403 (FR-17)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.revokeSession).mockRejectedValue(
      new ConnectError("not your session", Code.PermissionDenied),
    );

    const res = await DELETE(req(), { params: Promise.resolve({ id: "someone-elses" }) });

    expect(res.status).toBe(403);
  });
});
