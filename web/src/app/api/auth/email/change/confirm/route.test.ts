import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  authClient: { confirmEmailChange: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  userToJson: vi.fn((u) => u),
}));

import { authClient } from "@/lib/grpc/client";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/email/change/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const user = {
  id: "u1",
  email: "new@example.com",
  displayName: "Иван",
  role: "ROLE_USER",
  createdAt: "2026-01-14T00:00:00.000Z",
  club: "",
  emailVerified: true,
  pendingEmail: "",
  notifications: { applicationState: false, poolSeated: false },
};

describe("app/api/auth/email/change/confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is public: succeeds without any auth cookie and returns the updated user", async () => {
    vi.mocked(authClient.confirmEmailChange).mockResolvedValue({ user } as never);

    const res = await POST(req({ token: "tok-abc" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user });
    expect(authClient.confirmEmailChange).toHaveBeenCalledWith({ token: "tok-abc" });
  });

  it("maps an invalid/expired/used/taken-address failure (InvalidArgument) to 400 (unified message)", async () => {
    vi.mocked(authClient.confirmEmailChange).mockRejectedValue(
      new ConnectError("invalid token", Code.InvalidArgument),
    );

    const res = await POST(req({ token: "bad-tok" }));

    expect(res.status).toBe(400);
  });

  it("maps a now-taken address (AlreadyExists) to 409", async () => {
    vi.mocked(authClient.confirmEmailChange).mockRejectedValue(
      new ConnectError("email taken", Code.AlreadyExists),
    );

    const res = await POST(req({ token: "tok-abc" }));

    expect(res.status).toBe(409);
  });

  it("returns 400 on invalid json", async () => {
    const badReq = new NextRequest("http://localhost/api/auth/email/change/confirm", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(400);
    expect(authClient.confirmEmailChange).not.toHaveBeenCalled();
  });
});
