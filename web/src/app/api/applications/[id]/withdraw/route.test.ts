import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationClient: { withdrawApplication: vi.fn() },
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

describe("app/api/applications/[id]/withdraw route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationClient.withdrawApplication).not.toHaveBeenCalled();
  });

  it("withdraws and returns updated application", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.withdrawApplication).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_WITHDRAWN" },
    } as never);

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.application.state).toBe("APPLICATION_STATE_WITHDRAWN");
  });

  it("maps CodeFailedPrecondition (already terminal) to 409 with a Russian message (spec 0036, FR-6)", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.withdrawApplication).mockRejectedValue(
      new ConnectError("application: invalid transition", Code.FailedPrecondition),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Заявку нельзя отозвать в текущем состоянии");
  });

  it("maps CodeAborted (concurrent update) to 409 with a Russian retry message", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.withdrawApplication).mockRejectedValue(
      new ConnectError("version conflict", Code.Aborted),
    );

    const res = await POST(new NextRequest("http://localhost", { method: "POST" }), ctx("a1"));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Заявка уже изменилась — обновите страницу и попробуйте снова");
  });
});
