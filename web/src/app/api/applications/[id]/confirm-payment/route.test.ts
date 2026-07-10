import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { confirmPayment: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationToJson: vi.fn((a) => a),
}));

import { applicationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/applications/[id]/confirm-payment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationAdminClient.confirmPayment).not.toHaveBeenCalled();
  });

  it("confirms payment and returns updated application", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.confirmPayment).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_PAID" },
    } as never);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.application.state).toBe("APPLICATION_STATE_PAID");
  });

  it("maps CodePermissionDenied (not admin) to 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("user-tok");
    vi.mocked(applicationAdminClient.confirmPayment).mockRejectedValue(
      new ConnectError("admin role required", Code.PermissionDenied),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(403);
  });
});
