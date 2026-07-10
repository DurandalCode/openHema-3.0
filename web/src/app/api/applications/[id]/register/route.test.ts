import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { registerFighter: vi.fn() },
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

describe("app/api/applications/[id]/register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationAdminClient.registerFighter).not.toHaveBeenCalled();
  });

  it("registers and returns capacityExceeded=false when under capacity", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.registerFighter).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_REGISTERED" },
      capacityExceeded: false,
    } as never);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.application.state).toBe("APPLICATION_STATE_REGISTERED");
    expect(data.capacityExceeded).toBe(false);
  });

  it("surfaces capacityExceeded=true (soft warning, not blocking)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.registerFighter).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_REGISTERED" },
      capacityExceeded: true,
    } as never);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.capacityExceeded).toBe(true);
  });

  it("maps CodeFailedPrecondition (not paid yet) to 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.registerFighter).mockRejectedValue(
      new ConnectError("invalid transition", Code.FailedPrecondition),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(409);
  });
});
