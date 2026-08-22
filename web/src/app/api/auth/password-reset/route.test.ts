import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/grpc/client", () => ({
  authClient: { requestPasswordReset: vi.fn() },
}));

import { authClient } from "@/lib/grpc/client";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/auth/password-reset route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 {ok:true} when the account exists", async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({} as never);

    const res = await POST(req({ email: "ivan@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.requestPasswordReset).toHaveBeenCalledWith({
      email: "ivan@example.com",
    });
  });

  it("returns 200 {ok:true} even when the account does not exist (FR-2: answer must not leak existence)", async () => {
    vi.mocked(authClient.requestPasswordReset).mockResolvedValue({} as never);

    const res = await POST(req({ email: "nobody@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 {ok:true} even when the backend RPC fails (a different status would itself be an oracle)", async () => {
    vi.mocked(authClient.requestPasswordReset).mockRejectedValue(
      new ConnectError("internal error", Code.Internal),
    );

    const res = await POST(req({ email: "ivan@example.com" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 200 {ok:true} on invalid json body (still must not leak anything)", async () => {
    const badReq = new NextRequest("http://localhost/api/auth/password-reset", {
      method: "POST",
      body: "not-json",
    });

    const res = await POST(badReq);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(authClient.requestPasswordReset).not.toHaveBeenCalled();
  });
});
