import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationState } from "@/gen/hema/v1/application_pb";

vi.mock("@/lib/session/cookies", () => ({
  getAccessToken: vi.fn(),
}));
vi.mock("@/lib/grpc/client", () => ({
  applicationAdminClient: { listApplications: vi.fn() },
}));
vi.mock("@/lib/grpc/serialize", () => ({
  applicationsToJson: vi.fn((apps) => apps),
}));

import { applicationAdminClient } from "@/lib/grpc/client";
import { getAccessToken } from "@/lib/session/cookies";
import { GET } from "./route";

function req(query: string) {
  return new NextRequest(`http://localhost/api/applications/overview${query}`);
}

describe("app/api/applications/overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without access token", async () => {
    vi.mocked(getAccessToken).mockResolvedValue(undefined);

    const res = await GET(req("?tournamentId=t1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 without tournamentId", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(applicationAdminClient.listApplications).not.toHaveBeenCalled();
  });

  it("lists without filters", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [{ id: "a1" }, { id: "a2" }],
    } as never);

    const res = await GET(req("?tournamentId=t1"));
    expect(res.status).toBe(200);
    expect(applicationAdminClient.listApplications).toHaveBeenCalledWith(
      { tournamentId: "t1", status: undefined, nominationId: undefined },
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("passes status and nominationId filters through", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");
    vi.mocked(applicationAdminClient.listApplications).mockResolvedValue({
      applications: [],
    } as never);

    const res = await GET(
      req(`?tournamentId=t1&status=${ApplicationState.PAID}&nominationId=n1`),
    );
    expect(res.status).toBe(200);
    expect(applicationAdminClient.listApplications).toHaveBeenCalledWith(
      { tournamentId: "t1", status: ApplicationState.PAID, nominationId: "n1" },
      { headers: { Authorization: "Bearer tok" } },
    );
  });

  it("returns 400 for invalid status", async () => {
    vi.mocked(getAccessToken).mockResolvedValue("tok");

    const res = await GET(req("?tournamentId=t1&status=999"));
    expect(res.status).toBe(400);
    expect(applicationAdminClient.listApplications).not.toHaveBeenCalled();
  });
});
