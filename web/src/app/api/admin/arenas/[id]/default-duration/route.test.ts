import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  arenaAdminClient: { setArenaDefaultDuration: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  arenaToJson: vi.fn((a) => a ?? null),
}));

import { arenaAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { PUT } from "./route";

function putReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/arenas/a1/default-duration", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("app/api/admin/arenas/[id]/default-duration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await PUT(putReq({ defaultDurationSeconds: 120 }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(401);
    expect(arenaAdminClient.setArenaDefaultDuration).not.toHaveBeenCalled();
  });

  it("returns 400 when defaultDurationSeconds is missing/not a number", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await PUT(putReq({}), { params: Promise.resolve({ id: "a1" }) });
    expect(res.status).toBe(400);
    expect(arenaAdminClient.setArenaDefaultDuration).not.toHaveBeenCalled();
  });

  it("sets the default duration and returns the arena on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.setArenaDefaultDuration).mockResolvedValue({
      arena: { id: "a1", defaultDurationSeconds: 120 },
    } as never);

    const res = await PUT(putReq({ defaultDurationSeconds: 120 }), {
      params: Promise.resolve({ id: "a1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ arena: { id: "a1", defaultDurationSeconds: 120 } });
    expect(arenaAdminClient.setArenaDefaultDuration).toHaveBeenCalledWith(
      { arenaId: "a1", defaultDurationSeconds: 120 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError InvalidArgument (out of 1..3600 range) → 400", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(arenaAdminClient.setArenaDefaultDuration).mockRejectedValue(
      new ConnectError("out of range", Code.InvalidArgument),
    );
    const res = await PUT(putReq({ defaultDurationSeconds: 999999 }), {
      params: Promise.resolve({ id: "a1" }),
    });
    expect(res.status).toBe(400);
  });
});
