import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { moveFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fighters/f1/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "f1" }) };
}

describe("app/api/admin/fighters/[id]/move route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ fromNominationId: "n1", toNominationId: "n2" }), ctx());
    expect(res.status).toBe(401);
  });

  it("returns 400 when nomination ids are missing", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ fromNominationId: "n1" }), ctx());
    expect(res.status).toBe(400);
    expect(fighterAdminClient.moveFighter).not.toHaveBeenCalled();
  });

  it("moves fighter on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.moveFighter).mockResolvedValue({
      fighter: { id: "f1" },
    } as never);

    const res = await POST(req({ fromNominationId: "n1", toNominationId: "n2" }), ctx());
    expect(res.status).toBe(200);
    expect(fighterAdminClient.moveFighter).toHaveBeenCalledWith(
      { fighterId: "f1", fromNominationId: "n1", toNominationId: "n2" },
      { headers: { Authorization: "Bearer token" } },
    );
  });
});
