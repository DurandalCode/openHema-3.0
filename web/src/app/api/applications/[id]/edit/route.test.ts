import { ConnectError, Code } from "@connectrpc/connect";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { editApplication: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationToJson: vi.fn((a) => a),
}));

import { applicationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { ApplicationState } from "@/gen/hema/v1/application_pb";
import { POST } from "./route";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/applications/a1/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("app/api/applications/[id]/edit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await POST(postReq({ club: "X" }), ctx("a1"));
    expect(res.status).toBe(401);
    expect(applicationAdminClient.editApplication).not.toHaveBeenCalled();
  });

  it("edits club/needsEquipment/applicantNameOverride with defaults", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.editApplication).mockResolvedValue({
      application: { id: "a1", club: "HEMA Club" },
    } as never);

    const res = await POST(postReq({ club: "HEMA Club", needsEquipment: true }), ctx("a1"));
    expect(res.status).toBe(200);
    expect(applicationAdminClient.editApplication).toHaveBeenCalledWith(
      {
        applicationId: "a1",
        club: "HEMA Club",
        needsEquipment: true,
        applicantNameOverride: "",
        nominationId: undefined,
        state: undefined,
      },
      { headers: { Authorization: "Bearer admin-tok" } },
    );
  });

  it("passes nominationId when transferring", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.editApplication).mockResolvedValue({
      application: { id: "a1", nominationId: "n2" },
    } as never);

    await POST(postReq({ nominationId: "n2" }), ctx("a1"));
    expect(applicationAdminClient.editApplication).toHaveBeenCalledWith(
      expect.objectContaining({ nominationId: "n2" }),
      expect.anything(),
    );
  });

  it("maps state DTO string to proto enum", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.editApplication).mockResolvedValue({
      application: { id: "a1", state: "APPLICATION_STATE_REGISTERED" },
    } as never);

    await POST(postReq({ state: "APPLICATION_STATE_REGISTERED" }), ctx("a1"));
    expect(applicationAdminClient.editApplication).toHaveBeenCalledWith(
      expect.objectContaining({ state: ApplicationState.REGISTERED }),
      expect.anything(),
    );
  });

  it("returns 400 for unknown state value", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");

    const res = await POST(postReq({ state: "NOT_A_STATE" }), ctx("a1"));
    expect(res.status).toBe(400);
    expect(applicationAdminClient.editApplication).not.toHaveBeenCalled();
  });

  it("maps CodePermissionDenied (not admin) to 403", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("user-tok");
    vi.mocked(applicationAdminClient.editApplication).mockRejectedValue(
      new ConnectError("admin role required", Code.PermissionDenied),
    );

    const res = await POST(postReq({ club: "X" }), ctx("a1"));
    expect(res.status).toBe(403);
  });

  it("maps CodeAlreadyExists (transfer duplicate) to 409", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("admin-tok");
    vi.mocked(applicationAdminClient.editApplication).mockRejectedValue(
      new ConnectError("duplicate", Code.AlreadyExists),
    );

    const res = await POST(postReq({ nominationId: "n2" }), ctx("a1"));
    expect(res.status).toBe(409);
  });
});
