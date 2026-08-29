import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { updateNotificationSettings: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { PUT } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/notifications", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const user = {
  id: "u1",
  email: "ivan@example.com",
  displayName: "Иван",
  role: "ROLE_USER",
  createdAt: "2026-01-14T00:00:00.000Z",
  club: "",
  emailVerified: true,
  pendingEmail: "",
  notifications: { applicationState: true, poolSeated: false },
};

describe("app/api/auth/notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await PUT(req({ applicationState: true, poolSeated: false }));

    expect(res.status).toBe(401);
    expect(authClient.updateNotificationSettings).not.toHaveBeenCalled();
  });

  it("calls UpdateNotificationSettings and returns the updated user", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateNotificationSettings).mockResolvedValue({ user } as never);

    const res = await PUT(req({ applicationState: true, poolSeated: false }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user });
    expect(authClient.updateNotificationSettings).toHaveBeenCalledWith(
      { settings: { applicationState: true, poolSeated: false } },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("maps an unverified address (FailedPrecondition) to 409 (FR-21)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.updateNotificationSettings).mockRejectedValue(
      new ConnectError("email not verified", Code.FailedPrecondition),
    );

    const res = await PUT(req({ applicationState: true, poolSeated: false }));

    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const badReq = new NextRequest("http://localhost/api/auth/notifications", {
      method: "PUT",
      body: "not-json",
    });

    const res = await PUT(badReq);

    expect(res.status).toBe(400);
    expect(authClient.updateNotificationSettings).not.toHaveBeenCalled();
  });
});
