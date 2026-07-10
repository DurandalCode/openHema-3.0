import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationClient: { declarePayment: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationToJson: vi.fn((a) => a),
}));

import { applicationClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/applications/[id]/declare-payment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationClient.declarePayment).not.toHaveBeenCalled();
  });

  it("declares payment and returns updated application", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.declarePayment).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION" },
    } as never);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.application.state).toBe("APPLICATION_STATE_AWAITING_PAYMENT_CONFIRMATION");
    expect(applicationClient.declarePayment).toHaveBeenCalledWith(
      { applicationId: "a1" },
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("maps CodePermissionDenied (not owner) to 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.declarePayment).mockRejectedValue(
      new ConnectError("forbidden", Code.PermissionDenied),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(403);
  });

  it("maps CodeFailedPrecondition (invalid transition) to 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.declarePayment).mockRejectedValue(
      new ConnectError("invalid transition", Code.FailedPrecondition),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(409);
  });
});
