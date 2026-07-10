import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationClient: { getApplication: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationToJson: vi.fn((a) => a),
  applicationHistoryToJson: vi.fn((h) => h),
}));

import { applicationClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("app/api/applications/[id] route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET(new NextRequest("http://localhost/api/applications/a1"), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationClient.getApplication).not.toHaveBeenCalled();
  });

  it("returns application with history", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.getApplication).mockResolvedValue({
      application: { id: "a1" },
      history: [{ type: "APPLICATION_EVENT_TYPE_SUBMITTED" }],
    } as never);

    const res = await GET(new NextRequest("http://localhost/api/applications/a1"), ctx("a1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.application).toEqual({ id: "a1" });
    expect(data.history).toEqual([{ type: "APPLICATION_EVENT_TYPE_SUBMITTED" }]);
    expect(applicationClient.getApplication).toHaveBeenCalledWith(
      { applicationId: "a1" },
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("maps CodePermissionDenied (not owner/admin) to 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.getApplication).mockRejectedValue(
      new ConnectError("forbidden", Code.PermissionDenied),
    );

    const res = await GET(new NextRequest("http://localhost/api/applications/a1"), ctx("a1"));
    expect(res.status).toBe(403);
  });

  it("maps CodeNotFound to 404", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationClient.getApplication).mockRejectedValue(
      new ConnectError("missing", Code.NotFound),
    );

    const res = await GET(new NextRequest("http://localhost/api/applications/missing"), ctx("missing"));
    expect(res.status).toBe(404);
  });
});
