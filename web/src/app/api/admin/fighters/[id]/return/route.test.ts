import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { returnFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/admin/fighters/f1/return", { method: "POST" });
}

function ctx() {
  return { params: Promise.resolve({ id: "f1" }) };
}

describe("app/api/admin/fighters/[id]/return route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(401);
    expect(fighterAdminClient.returnFighter).not.toHaveBeenCalled();
  });

  it("returns fighter on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.returnFighter).mockResolvedValue({
      fighter: { id: "f1", status: "FIGHTER_STATUS_ACTIVE" },
    } as never);

    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(fighterAdminClient.returnFighter).toHaveBeenCalledWith(
      { fighterId: "f1" },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});
