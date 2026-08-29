import { ConnectError, Code } from "@connectrpc/connect";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  authClient: { resendEmailVerification: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

describe("app/api/auth/email/resend route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no access token cookie", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(authClient.resendEmailVerification).not.toHaveBeenCalled();
  });

  it("calls ResendEmailVerification with the Bearer token on success", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.resendEmailVerification).mockResolvedValue({} as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.resendEmailVerification).toHaveBeenCalledWith(
      {},
      { headers: { Authorization: "Bearer tok-xyz" } },
    );
  });

  it("maps throttling (ResourceExhausted) to 429 (FR-4)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok-xyz");
    vi.mocked(authClient.resendEmailVerification).mockRejectedValue(
      new ConnectError("too many attempts", Code.ResourceExhausted),
    );

    const res = await POST();

    expect(res.status).toBe(429);
  });
});
