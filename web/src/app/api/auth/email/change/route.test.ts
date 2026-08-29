import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { requestEmailChange: vi.fn(), cancelEmailChange: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST, DELETE } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/email/change", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const user = {
  id: "u1",
  email: "old@example.com",
  displayName: "Иван",
  role: "ROLE_USER",
  createdAt: "2026-01-14T00:00:00.000Z",
  club: "",
  emailVerified: true,
  pendingEmail: "new@example.com",
  notifications: { applicationState: false, poolSeated: false },
};

describe("app/api/auth/email/change route (POST)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(req({ newEmail: "new@example.com", currentPassword: "pw" }));

    expect(res.status).toBe(401);
    expect(authClient.requestEmailChange).not.toHaveBeenCalled();
  });

  it("calls RequestEmailChange and returns the user with pendingEmail (FR-6)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.requestEmailChange).mockResolvedValue({ user } as never);

    const res = await POST(req({ newEmail: "new@example.com", currentPassword: "pw" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user });
    expect(authClient.requestEmailChange).toHaveBeenCalledWith(
      { newEmail: "new@example.com", currentPassword: "pw" },
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("maps a taken address (AlreadyExists) to 409 (FR-8)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.requestEmailChange).mockRejectedValue(
      new ConnectError("email taken", Code.AlreadyExists),
    );

    const res = await POST(req({ newEmail: "taken@example.com", currentPassword: "pw" }));

    expect(res.status).toBe(409);
  });

  it("maps a wrong current password (Unauthenticated) to 401", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.requestEmailChange).mockRejectedValue(
      new ConnectError("invalid credentials", Code.Unauthenticated),
    );

    const res = await POST(req({ newEmail: "new@example.com", currentPassword: "wrong" }));

    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid json", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const badReq = new NextRequest("http://localhost/api/auth/email/change", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(400);
    expect(authClient.requestEmailChange).not.toHaveBeenCalled();
  });
});

describe("app/api/auth/email/change route (DELETE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await DELETE();

    expect(res.status).toBe(401);
    expect(authClient.cancelEmailChange).not.toHaveBeenCalled();
  });

  it("calls CancelEmailChange and returns the user without pendingEmail", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    const cancelledUser = { ...user, pendingEmail: "" };
    vi.mocked(authClient.cancelEmailChange).mockResolvedValue({ user: cancelledUser } as never);

    const res = await DELETE();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: cancelledUser });
    expect(authClient.cancelEmailChange).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });
});
