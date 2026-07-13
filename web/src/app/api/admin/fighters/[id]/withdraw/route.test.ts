import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  fighterAdminClient: { withdrawFighter: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  fighterToJson: vi.fn((f) => f),
}));

import { fighterAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { fighterToJson } from "@/lib/grpc/serialize";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/admin/fighters/f1/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "f1" }) };
}

describe("app/api/admin/fighters/[id]/withdraw route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);
    const res = await POST(req({ reason: "WITHDRAWAL_REASON_INJURY" }), ctx());
    expect(res.status).toBe(401);
    expect(fighterAdminClient.withdrawFighter).not.toHaveBeenCalled();
  });

  it("returns 400 when reason is missing/unknown", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    const res = await POST(req({ reason: "NOT_A_REASON" }), ctx());
    expect(res.status).toBe(400);
    expect(fighterAdminClient.withdrawFighter).not.toHaveBeenCalled();
  });

  it("withdraws fighter on ok", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.withdrawFighter).mockResolvedValue({
      fighter: { id: "f1", status: "FIGHTER_STATUS_WITHDRAWN" },
    } as never);
    vi.mocked(fighterToJson).mockReturnValue({ id: "f1" } as never);

    const res = await POST(req({ reason: "WITHDRAWAL_REASON_BAN" }), ctx());
    expect(res.status).toBe(200);
    expect(fighterAdminClient.withdrawFighter).toHaveBeenCalledWith(
      { fighterId: "f1", reason: 2 },
      { headers: { Authorization: "Bearer token" } },
    );
  });

  it("maps ConnectError FailedPrecondition → 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("token");
    vi.mocked(fighterAdminClient.withdrawFighter).mockRejectedValue(
      new ConnectError("already withdrawn", Code.FailedPrecondition),
    );
    const res = await POST(req({ reason: "WITHDRAWAL_REASON_INJURY" }), ctx());
    expect(res.status).toBe(409);
  });
});
